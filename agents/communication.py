"""
communication.py — Communication Agent
Generates a coordinator memo and patient letter for each HIGH-risk patient.

v2: drafting runs as a concurrent batch (same ThreadPoolExecutor pattern as
triage), and only the high-risk cohort gets letters — that is where a coordinator
actually acts, and it keeps the GPU budget focused. Backend chosen by llm_config.
"""

import duckdb
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
import graph as g
import llm_config

DB_PATH = str(Path(__file__).parent.parent / "db" / "waitwise.db")

DRAFTED_EVENT_SAMPLE = 8

# Cap on how many high-risk patients get memo+letter drafts per scan. 0 = all.
# Each patient = 2 LLM calls, so this is the heaviest stage on a real model —
# cap it for a snappy live demo (the highest-risk patients are drafted first).
COMMS_CAP = int(os.getenv("WAITWISE_COMMS_CAP", "0"))


def _mock_comms(patient: dict, triage: dict) -> tuple[str, str]:
    """Deterministic mock output. Mirrors format in communications.csv."""
    memo = (
        f"{'URGENT — ' if triage['risk_level'] == 'high' else ''}"
        f"{patient['name']} ({patient['patient_id']}), age {patient['age']}, {patient['condition']}. "
        f"Patient has been on the waiting list for {patient['wait_weeks']} weeks. "
        f"Risk assessment: {triage['risk_level'].upper()} (score {triage['risk_score']}). "
        f"Recommended action: {triage['recommended_action']}. "
        f"Reason: {triage['reason']}"
    )
    first_name = patient.get('name', 'Patient').split()[0]
    letter = (
        f"Dear {first_name},\n\n"
        f"We are writing to update you on your NHS waiting list status for {patient['condition']} treatment. "
        f"You have been waiting for {patient['wait_weeks']} weeks and we want to make sure you are being supported. "
        f"A coordinator will be in touch within the next few days to discuss next steps.\n\n"
        f"If you have any questions, please contact your GP practice.\n\n"
        f"NHS Waiting List Coordination Team"
    )
    return memo, letter


def _llm_comms(patient: dict, triage: dict) -> tuple[str, str]:
    client = llm_config.get_client()

    memo_prompt = f"""Write an internal coordinator memo for the following NHS patient flagged by the WaitWise system.
Be clinical, urgent if risk is high, and concise.

Patient: {patient['name']}, age {patient['age']}, {patient['condition']}, {patient['wait_weeks']} weeks wait.
Risk: {triage['risk_level'].upper()} (score {triage['risk_score']}).
Reason: {triage['reason']}
Recommended action: {triage['recommended_action']}

Write the memo only."""

    letter_prompt = f"""Write a compassionate, plain-English letter to an NHS patient who has been waiting for treatment.
Do not alarm them. Explain that a coordinator will be in touch.

Patient first name: {patient['name'].split()[0]}
Condition: {patient['condition']}
Weeks waiting: {patient['wait_weeks']}
Borough: {patient.get('borough', '')}

Write the letter only."""

    def call(prompt):
        r = client.chat.completions.create(
            model=llm_config.MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=300,
        )
        return r.choices[0].message.content.strip()

    return call(memo_prompt), call(letter_prompt)


def _draft_one(patient: dict, triage: dict) -> tuple[str, str]:
    llm_config.mock_pace()  # watchable demo pacing (no-op for real backends)
    try:
        return _mock_comms(patient, triage) if llm_config.is_mock() else _llm_comms(patient, triage)
    except Exception:
        return _mock_comms(patient, triage)


def run(state: dict) -> dict:
    """
    state keys consumed: flagged_patients, triage_results, scan_run_id
    state keys produced: communications (list of dicts)
    """
    con = duckdb.connect(DB_PATH)
    scan_id = state["scan_run_id"]
    emit = g.EVENT_QUEUES.get(scan_id, []).append
    comms = []

    patient_by_pid = {p["patient_id"]: p for p in state["flagged_patients"]}

    # Only draft for HIGH-risk patients — that is where coordinators act.
    targets = [t for t in state["triage_results"] if t["risk_level"] == "high"]
    targets.sort(key=lambda t: t["risk_score"], reverse=True)
    if COMMS_CAP > 0:
        targets = targets[:COMMS_CAP]

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

    if not targets:
        con.close()
        state["communications"] = []
        return state

    event("communication", "drafting",
          f"Drafting coordinator memos + patient letters for {len(targets)} high-risk patients "
          f"via {llm_config.LABEL}...")

    start = datetime.now(timezone.utc)
    workers = 1 if llm_config.is_mock() else llm_config.MAX_CONCURRENCY
    drafted: list[tuple[dict, tuple[str, str]]] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {}
        for triage in targets:
            patient = patient_by_pid.get(triage["patient_id"])
            if patient is None:
                continue
            futures[pool.submit(_draft_one, patient, triage)] = (patient, triage)
        for fut in futures:
            drafted.append((futures[fut], fut.result()))

    elapsed_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)

    for (patient, triage), (memo, letter) in drafted:
        pid = patient["patient_id"]
        now = datetime.now(timezone.utc).isoformat()
        for comm_type, content in [("coordinator_memo", memo), ("patient_letter", letter)]:
            comm_row = {
                "communication_id": f"COMM{uuid.uuid4().hex[:6].upper()}",
                "scan_run_id": scan_id,
                "patient_id": pid,
                "type": comm_type,
                "language": patient.get("primary_language", "English"),
                "channel": "letter",
                "needs_translation": patient.get("multilingual_required", False),
                "content": content,
                "generated_timestamp": now,
                "status": "pending",
            }
            comms.append(comm_row)
            cols = ", ".join(comm_row.keys())
            placeholders = ", ".join(["?" for _ in comm_row])
            con.execute(
                f"INSERT INTO communications ({cols}) VALUES ({placeholders})",
                list(comm_row.values()),
            )

    for (patient, _t), _ in drafted[:DRAFTED_EVENT_SAMPLE]:
        event("communication", "drafted",
              f"Communications ready for {patient['patient_id']}.",
              patient_id=patient["patient_id"])

    event("communication", "drafted",
          f"Drafting complete: {len(drafted)} memo+letter pairs in {elapsed_ms} ms.",
          n_drafted=len(drafted), elapsed_ms=elapsed_ms)

    con.close()
    state["communications"] = comms
    return state
