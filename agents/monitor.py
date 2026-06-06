"""
monitor.py — Monitor Agent
No LLM. Pure SQL against DuckDB.
Scores and ranks all patients by risk, returns the top N worst cases.
This is more realistic than returning every threshold breach — in production
you always want "who needs attention most urgently right now."
"""

import duckdb
import uuid
from datetime import datetime, timezone
from pathlib import Path
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
import graph as g

DB_PATH = str(Path(__file__).parent.parent / "db" / "waitwise.db")

# How many patients to surface per scan run
TOP_N = 3  # change for demo if you want more/fewer patients surfaced


def run(state: dict) -> dict:
    """
    state keys consumed: scan_run_id, event_queue
    state keys produced: flagged_patients (list of dicts, max TOP_N)
    """
    con = duckdb.connect(DB_PATH)
    scan_id = state["scan_run_id"]
    emit = g.EVENT_QUEUES.get(scan_id, []).append

    def event(agent, event_type, message, patient_id=""):
        emit({
            "event_id": f"EVT{uuid.uuid4().hex[:6].upper()}",
            "scan_run_id": scan_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": agent,
            "event_type": event_type,
            "patient_id": patient_id,
            "message": message,
        })

    total = con.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
    event("monitor", "scan_start", f"Monitor Agent: querying DuckDB. Scanning {total} patients...")

    event("monitor", "rule_check", "Scoring rule: wait_weeks > 52 AND ever_contacted = FALSE (+3 points)")
    event("monitor", "rule_check", "Scoring rule: imd_quintile = 1 AND wait_weeks > 26 AND ever_contacted = FALSE (+2 points)")
    event("monitor", "rule_check", "Scoring rule: pathway_changed = TRUE AND wait_weeks > 20 (+1 point)")
    event("monitor", "rule_check", "Checking contact log quality — penalising failed contact attempts")

    # Score every patient by how many risk rules they trigger.
    # Higher score = worse situation = surfaces first.
    # The HERO patients score highest because they hit multiple rules simultaneously.
    candidates = con.execute("""
        WITH scored AS (
            SELECT
                p.patient_id,
                -- Rule 1: long-waiter never contacted (RAG002 + RAG004)
                CASE WHEN p.wait_weeks > 52 AND p.ever_contacted = FALSE THEN 3 ELSE 0 END +
                -- Rule 2: deprived borough, still uncontacted past 26wk (RAG004)
                CASE WHEN p.imd_quintile = 1 AND p.wait_weeks > 26 AND p.ever_contacted = FALSE THEN 2 ELSE 0 END +
                -- Rule 3: pathway changed mid-wait (RAG005)
                CASE WHEN p.pathway_changed = TRUE AND p.wait_weeks > 20 THEN 1 ELSE 0 END +
                -- Bonus: functionally uncontacted (all contact attempts failed)
                CASE WHEN EXISTS (
                    SELECT 1 FROM contact_history ch
                    WHERE ch.patient_id = p.patient_id
                    HAVING COUNT(*) > 0
                       AND COUNT(*) = SUM(CASE WHEN ch.outcome IN ('Number not in service','Wrong contact details') THEN 1 ELSE 0 END)
                ) THEN 2 ELSE 0 END
                AS risk_score
            FROM patients p
            WHERE p.flagged = TRUE
        )
        SELECT patient_id, risk_score
        FROM scored
        WHERE risk_score > 0
        ORDER BY risk_score DESC
        LIMIT ?
    """, [TOP_N]).df()

    if candidates.empty:
        flagged_patients = []
    else:
        placeholders = ",".join(f"'{pid}'" for pid in candidates["patient_id"].tolist())
        flagged_patients = con.execute(
            f"SELECT * FROM patients WHERE patient_id IN ({placeholders})"
        ).df().to_dict("records")

        # Attach the monitor risk score to each patient for reference
        score_map = dict(zip(candidates["patient_id"], candidates["risk_score"]))
        for p in flagged_patients:
            p["monitor_score"] = score_map.get(p["patient_id"], 0)

    for p in flagged_patients:
        event(
            "monitor", "flag",
            f"FLAGGED: {p['patient_id']} — score {p['monitor_score']}, "
            f"{p['wait_weeks']}wk wait, ever_contacted={p['ever_contacted']}, "
            f"IMD Q{p['imd_quintile']} {p['borough']}",
            patient_id=p["patient_id"]
        )

    event("monitor", "scan_complete",
          f"Monitor Agent complete. {total} patients scanned. "
          f"Top {len(flagged_patients)} coordination failures surfaced.")

    con.close()
    state["flagged_patients"] = flagged_patients
    state["total_scanned"] = total
    return state
