"""
monitor.py — Monitor Agent
No LLM. Pure SQL against DuckDB.

v2: scans all ~10k patients and surfaces the FULL flagged cohort (~1,240), then
tiers it so the expensive GPU triage is spent only where it matters:

  Tier 0 (CPU, here):   10,003 → ~1,240 flagged   (auditable SQL rules)
  Tier 2 (GPU, triage): all `high` band + top-N `medium`   (full RAG + LLM)
  Tier 1 (carried):     the remaining flagged           (cheap rank, queued)

The whole flagged cohort goes to the dashboard as a prioritised queue; only the
Tier-2 slice is sent downstream for full triage + communication drafting.
"""

import duckdb
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
import graph as g

DB_PATH = str(Path(__file__).parent.parent / "db" / "waitwise.db")

# How many MEDIUM-band patients to triage with the full LLM pass, on top of every
# HIGH-band patient. Keep small for a live demo on a real model; the mock is
# instant so it can go higher. Set from Friday's tokens/sec benchmark.
TRIAGE_MEDIUM_CAP = int(os.getenv("WAITWISE_TRIAGE_MEDIUM_CAP", "25"))

# How many individual FLAG events to stream to the live trace (the rest are
# summarised — streaming 1,240 lines would flood the UI).
FLAG_EVENT_SAMPLE = 8


def run(state: dict) -> dict:
    """
    state keys consumed: scan_run_id
    state keys produced:
        flagged_patients  — the Tier-2 slice to triage (high + top medium)
        cohort_summary    — counts for the dashboard header
        cohort_queue      — lightweight rows for the full flagged queue
        total_scanned
    """
    con = duckdb.connect(DB_PATH)
    scan_id = state["scan_run_id"]
    emit = g.EVENT_QUEUES.get(scan_id, []).append

    def event(agent, event_type, message, patient_id="", **extra):
        evt = {
            "event_id": f"EVT{uuid.uuid4().hex[:6].upper()}",
            "scan_run_id": scan_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": agent,
            "event_type": event_type,
            "patient_id": patient_id,
            "message": message,
        }
        evt.update(extra)
        emit(evt)

    total = con.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
    event("monitor", "scan_start", f"Monitor Agent: querying DuckDB. Scanning {total:,} patients...")

    event("monitor", "rule_check", "Scoring rule: wait_weeks > 52 AND ever_contacted = FALSE (+3 points)")
    event("monitor", "rule_check", "Scoring rule: imd_quintile = 1 AND wait_weeks > 26 AND ever_contacted = FALSE (+2 points)")
    event("monitor", "rule_check", "Scoring rule: pathway_changed = TRUE AND wait_weeks > 20 (+1 point)")
    event("monitor", "rule_check", "Checking contact log quality — penalising failed contact attempts")

    # Rank the ENTIRE flagged cohort. We lean on the precomputed risk_band/flag_*
    # columns for the cohort story, and add an auditable rule score for ranking.
    cohort = con.execute("""
        WITH scored AS (
            SELECT
                p.patient_id,
                p.risk_band,
                COALESCE(p.flag_count, 0) AS flag_count,
                p.wait_weeks,
                CASE WHEN p.wait_weeks > 52 AND p.ever_contacted = FALSE THEN 3 ELSE 0 END +
                CASE WHEN p.imd_quintile = 1 AND p.wait_weeks > 26 AND p.ever_contacted = FALSE THEN 2 ELSE 0 END +
                CASE WHEN p.pathway_changed = TRUE AND p.wait_weeks > 20 THEN 1 ELSE 0 END +
                CASE WHEN EXISTS (
                    SELECT 1 FROM contact_history ch
                    WHERE ch.patient_id = p.patient_id
                    HAVING COUNT(*) > 0
                       AND COUNT(*) = SUM(CASE WHEN ch.outcome IN ('Number not in service','Wrong contact details') THEN 1 ELSE 0 END)
                ) THEN 2 ELSE 0 END
                AS monitor_score
            FROM patients p
            WHERE p.flagged = TRUE
        )
        SELECT patient_id, risk_band, flag_count, wait_weeks, monitor_score
        FROM scored
        ORDER BY
            CASE risk_band WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            monitor_score DESC,
            wait_weeks DESC
    """).df()

    n_flagged = len(cohort)
    n_high = int((cohort["risk_band"] == "high").sum())
    n_medium = int((cohort["risk_band"] == "medium").sum())
    n_low = int((cohort["risk_band"] == "low").sum())

    # --- Tier-2 selection: every high + the top-N medium -------------------
    high_ids = cohort.loc[cohort["risk_band"] == "high", "patient_id"].tolist()
    medium_ids = cohort.loc[cohort["risk_band"] == "medium", "patient_id"].head(TRIAGE_MEDIUM_CAP).tolist()
    triage_ids = high_ids + medium_ids

    score_map = dict(zip(cohort["patient_id"], cohort["monitor_score"]))
    band_map = dict(zip(cohort["patient_id"], cohort["risk_band"]))

    flagged_patients = []
    if triage_ids:
        placeholders = ",".join(f"'{pid}'" for pid in triage_ids)
        rows = con.execute(
            f"SELECT * FROM patients WHERE patient_id IN ({placeholders})"
        ).df().to_dict("records")
        by_id = {r["patient_id"]: r for r in rows}
        # Preserve the tiered ordering from triage_ids.
        for pid in triage_ids:
            p = by_id.get(pid)
            if not p:
                continue
            p["monitor_score"] = int(score_map.get(pid, 0))
            flagged_patients.append(p)

    # Lightweight queue rows for the dashboard (the full flagged cohort).
    cohort_queue = [
        {
            "patient_id": r["patient_id"],
            "risk_band": r["risk_band"],
            "flag_count": int(r["flag_count"]),
            "wait_weeks": int(r["wait_weeks"]),
            "monitor_score": int(r["monitor_score"]),
            "tier": 2 if r["patient_id"] in set(triage_ids) else 1,
        }
        for r in cohort.to_dict("records")
    ]

    # Stream a sample of flags + a cohort summary (not all 1,240).
    for p in flagged_patients[:FLAG_EVENT_SAMPLE]:
        event(
            "monitor", "flag",
            f"FLAGGED: {p['patient_id']} — {p['risk_band'].upper()} band, "
            f"{p['wait_weeks']}wk wait, ever_contacted={p['ever_contacted']}, "
            f"IMD Q{p['imd_quintile']} {p['borough']}",
            patient_id=p["patient_id"],
        )

    event(
        "monitor", "cohort_summary",
        f"{n_flagged:,} coordination failures flagged of {total:,} scanned — "
        f"{n_high} high · {n_medium} medium · {n_low} low. "
        f"Routing {len(flagged_patients)} (all high + top {len(medium_ids)} medium) to GPU triage.",
        n_flagged=n_flagged, n_high=n_high, n_medium=n_medium, n_low=n_low,
        n_triage=len(flagged_patients),
    )

    event("monitor", "scan_complete",
          f"Monitor Agent complete. {total:,} patients scanned in CPU SQL. "
          f"{len(flagged_patients)} routed to triage; {n_flagged:,}-row queue surfaced.")

    con.close()
    state["flagged_patients"] = flagged_patients
    state["cohort_queue"] = cohort_queue
    state["cohort_summary"] = {
        "total_scanned": total,
        "n_flagged": n_flagged,
        "n_high": n_high,
        "n_medium": n_medium,
        "n_low": n_low,
        "n_triaged": len(flagged_patients),
    }
    state["total_scanned"] = total
    return state
