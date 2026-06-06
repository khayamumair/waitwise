"""
communication.py — Communication Agent
Generates a coordinator memo and patient letter for each flagged patient.
Uses the same MOCK_LLM toggle as triage.py.
"""

import duckdb
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from openai import OpenAI
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
import graph as g

DB_PATH = str(Path(__file__).parent.parent / "db" / "waitwise.db")
MOCK_LLM = os.getenv("MOCK_LLM", "false").lower() == "true"
VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:11434/v1")
VLLM_MODEL    = os.getenv("VLLM_MODEL",    "llama3.2:3b")


def _mock_comms(patient: dict, triage: dict) -> tuple[str, str]:
    """Deterministic mock output. Mirrors format in communications.csv."""
    urgency = "URGENT — HIGH RISK" if triage['risk_level'] == 'high' else triage['risk_level'].upper()
    memo = (
        f"[{urgency}]\n"
        f"Patient: {patient['name']} ({patient['patient_id']}) | Age {patient['age']} | {patient['condition']} | {patient['wait_weeks']} wks waiting\n"
        f"Action:  {triage['recommended_action']}\n"
        f"Reason:  {triage['reason']}"
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
    client = OpenAI(base_url=VLLM_BASE_URL, api_key="EMPTY")

    urgency = "URGENT — HIGH RISK" if triage['risk_level'] == 'high' else triage['risk_level'].upper()
    memo_prompt = f"""Write a 4-line internal coordinator memo for an NHS patient flagged by WaitWise.
Use EXACTLY this format — no extra text, no preamble:

[{urgency}]
Patient: {patient['name']} ({patient['patient_id']}) | Age {patient['age']} | {patient['condition']} | {patient['wait_weeks']} wks waiting
Action:  <one-line action — what the coordinator must do>
Reason:  <one-line clinical reason — keep under 20 words>

Data:
Risk score: {triage['risk_score']}
Reason: {triage['reason']}
Recommended action: {triage['recommended_action']}"""

    letter_prompt = f"""Write a compassionate, plain-English letter to an NHS patient who has been waiting for treatment.
Do not alarm them. Explain that a coordinator will be in touch.

Patient first name: {patient['name'].split()[0]}
Condition: {patient['condition']}
Weeks waiting: {patient['wait_weeks']}
Borough: {patient.get('borough', '')}

Write the letter only."""

    def call(prompt):
        r = client.chat.completions.create(
            model=VLLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=300,
        )
        return r.choices[0].message.content.strip()

    return call(memo_prompt), call(letter_prompt)


def run(state: dict) -> dict:
    """
    state keys consumed: flagged_patients, triage_results, scan_run_id, event_queue
    state keys produced: communications (list of dicts)
    """
    con = duckdb.connect(DB_PATH)
    scan_id = state["scan_run_id"]
    emit = g.EVENT_QUEUES.get(scan_id, []).append
    comms = []

    # Build a lookup so we can match patient data to triage results
    triage_by_pid = {t["patient_id"]: t for t in state["triage_results"]}
    patient_by_pid = {p["patient_id"]: p for p in state["flagged_patients"]}

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

    for triage in state["triage_results"]:
        pid = triage["patient_id"]
        patient = patient_by_pid[pid]

        event("communication", "drafting",
              f"Generating coordinator memo and patient letter for {pid}...",
              patient_id=pid)

        memo, letter = _mock_comms(patient, triage) if MOCK_LLM else _llm_comms(patient, triage)
        now = datetime.now(timezone.utc).isoformat()

        # New schema stores memo and letter as two separate rows with a 'type' field
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
                list(comm_row.values())
            )

        event("communication", "drafted",
              f"Communications ready for {pid}.",
              patient_id=pid)

    con.close()
    state["communications"] = comms
    return state
