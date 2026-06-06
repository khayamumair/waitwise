"""
insights.py — cohort-level analytics over the full waiting list.

These are the non-obvious, decision-grade findings a coordinator or ICB planner
can act on tomorrow — computed in CPU SQL over the whole 10k cohort (joining the
RTT clock, pathway-event and deprivation tables the triage pipeline doesn't
touch). Deliberately separate from per-patient triage: this is the "why is the
list failing" view, not the "who do I call first" view.
"""

import duckdb
import os
from pathlib import Path

DB_PATH = os.getenv("WAITWISE_DB_PATH", str(Path(__file__).parent / "db" / "waitwise.db"))


def _q(con, sql, params=None):
    return con.execute(sql, params or []).fetchall()


def compute_insights() -> dict:
    con = duckdb.connect(DB_PATH, read_only=True)
    try:
        findings = [
            _silent_52wk_breaches(con),
            _reassessment_blind_spots(con),
            _dna_deprivation_gradient(con),
            _borough_breach_concentration(con),
        ]
    finally:
        con.close()
    return {"insights": [f for f in findings if f]}


def _silent_52wk_breaches(con) -> dict:
    """52-week RTT breaches who have NEVER been contacted — the worst failures."""
    n = _q(con, """
        SELECT COUNT(*) FROM patients p JOIN waiting_list_status w USING(patient_id)
        WHERE w.breach_52wk = TRUE AND p.ever_contacted = FALSE
    """)[0][0]
    total_52 = _q(con, "SELECT COUNT(*) FROM waiting_list_status WHERE breach_52wk = TRUE")[0][0]
    pct = round(100 * n / total_52, 0) if total_52 else 0
    return {
        "id": "silent_52wk",
        "severity": "critical",
        "title": "Silent 52-week breaches",
        "stat": f"{n}",
        "unit": "patients",
        "headline": f"{n} patients have breached the 52-week RTT standard and have never once been contacted.",
        "detail": f"That is {pct:.0f}% of all 52-week breaches sitting with zero coordination contact — "
                  f"the highest-liability cohort on the entire list.",
        "action": "Prioritise for same-week outreach; these carry both clinical and regulatory risk.",
    }


def _reassessment_blind_spots(con) -> dict:
    """Pathway changed → reassessment flagged → but patient never contacted."""
    n = _q(con, """
        SELECT COUNT(DISTINCT p.patient_id)
        FROM patients p JOIN pathway_events e USING(patient_id)
        WHERE e.event_type = 'reassessment_required' AND p.ever_contacted = FALSE
    """)[0][0]
    return {
        "id": "reassessment_blind_spots",
        "severity": "high",
        "title": "Reassessment blind spots",
        "stat": f"{n}",
        "unit": "patients",
        "headline": f"{n} patients were flagged for clinical reassessment after a pathway change "
                    f"but were never contacted.",
        "detail": "A pathway change should restart active management. These cases changed clinically "
                  "and then went silent — exactly the gap that turns a wait into a harm.",
        "action": "Route to clinical review; the original triage no longer reflects their pathway.",
    }


def _dna_deprivation_gradient(con) -> dict:
    """Did-not-attend rate by deprivation quintile — the non-obvious one."""
    rows = _q(con, """
        SELECT p.imd_quintile AS q, COUNT(DISTINCT p.patient_id) AS n
        FROM patients p JOIN pathway_events e USING(patient_id)
        WHERE e.event_type = 'dna'
        GROUP BY 1 ORDER BY 1
    """)
    by_q = {int(q): n for q, n in rows}
    q1, q5 = by_q.get(1, 0), by_q.get(5, 0)
    ratio = round(q1 / q5, 1) if q5 else None
    return {
        "id": "dna_deprivation_gradient",
        "severity": "insight",
        "title": "Missed appointments track deprivation",
        "stat": f"{ratio}×" if ratio else "—",
        "unit": "Q1 vs Q5",
        "headline": f"Did-not-attend appointments are {ratio}× more common in the most deprived quintile "
                    f"than the least ({q1} vs {q5}).",
        "detail": "A missed appointment in the poorest boroughs is not non-compliance — it is an access "
                  "barrier (transport, work, language, caring). Treating DNAs as patient fault entrenches "
                  "inequality; treating them as a coordination signal reverses it.",
        "action": "Switch DNA follow-up in IMD Q1–2 to assisted booking + interpreter by default.",
        "series": [{"quintile": q, "dna_patients": by_q.get(q, 0)} for q in range(1, 6)],
    }


def _borough_breach_concentration(con) -> dict:
    """Which borough has the worst 52-week breach rate, against its deprivation."""
    rows = _q(con, """
        SELECT p.borough,
               ROUND(100.0 * SUM(CASE WHEN w.breach_52wk THEN 1 ELSE 0 END) / COUNT(*), 1) AS rate,
               COUNT(*) AS n
        FROM patients p JOIN waiting_list_status w USING(patient_id)
        GROUP BY 1 ORDER BY rate DESC LIMIT 1
    """)
    if not rows:
        return None
    borough, rate, n = rows[0]
    dep = _q(con, "SELECT imd_avg_quintile, economic_inactivity_pct FROM borough_deprivation WHERE borough = ?",
             [borough])
    imd = dep[0][0] if dep else None
    inactivity = dep[0][1] if dep else None
    return {
        "id": "borough_breach_concentration",
        "severity": "high",
        "title": "Breach hotspot",
        "stat": f"{rate:.1f}%",
        "unit": borough,
        "headline": f"{borough} has the highest 52-week breach rate ({rate:.1f}% of {n:,} patients).",
        "detail": f"It sits in IMD quintile {imd} with {inactivity:.0f}% economic inactivity — breaches "
                  f"concentrate where the population can least absorb the delay."
                  if imd is not None else
                  f"{rate:.1f}% of its {n:,} patients have breached 52 weeks.",
        "action": "Target additional capacity here; equal waits across boroughs are not equitable outcomes.",
    }


if __name__ == "__main__":
    import json
    print(json.dumps(compute_insights(), indent=2))
