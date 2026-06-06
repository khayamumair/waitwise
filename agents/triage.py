"""
triage.py — Triage Agent
Retrieves relevant NHS rules from ChromaDB, then calls Nemotron to assess each patient.
Set MOCK_LLM=True to run without a GPU (returns deterministic mock output).
"""

import duckdb
import chromadb
import json
import os
from chromadb.utils import embedding_functions
from datetime import datetime, timezone
from pathlib import Path
from openai import OpenAI
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
import graph as g

DB_PATH = str(Path(__file__).parent.parent / "db" / "waitwise.db")
VECTOR_PATH = str(Path(__file__).parent.parent / "vector_store")

##################################################################
# --- Set to False when running on the DGX Spark with vLLM ---
MOCK_LLM = False # True

# vLLM on DGX Spark exposes an OpenAI-compatible endpoint at localhost:8000
# VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")
# VLLM_MODEL = os.getenv("VLLM_MODEL", "nvidia/Nemotron-Mini-4B-Instruct")

#Local LLM
VLLM_BASE_URL = "http://localhost:11434/v1"
VLLM_MODEL = "llama3.2:3b"

#################################

def _get_llm_client():
    # api_key="EMPTY" is required by vLLM even though it doesn't check it
    return OpenAI(base_url=VLLM_BASE_URL, api_key="EMPTY")


def _retrieve_context(patient: dict) -> str:
    """Query ChromaDB for the most relevant NHS rules for this patient."""
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
    client = chromadb.PersistentClient(path=VECTOR_PATH)

    rag_col = client.get_collection("rag_knowledge_base", embedding_function=ef)
    bw_col = client.get_collection("borough_deprivation", embedding_function=ef)

    query = (
        f"{patient['condition']} patient, age {patient['age']}, "
        f"waited {patient['wait_weeks']} weeks, IMD quintile {patient['imd_quintile']}, "
        f"ever contacted: {patient['ever_contacted']}, borough: {patient['borough']}"
    )

    rag_results = rag_col.query(query_texts=[query], n_results=4)
    bw_results = bw_col.query(query_texts=[patient["borough"]], n_results=1)

    chunks = rag_results["documents"][0] + bw_results["documents"][0]
    return "\n".join(f"- {c}" for c in chunks)


def _mock_triage(patient: dict, context: str) -> dict:
    """
    Returns a deterministic result without calling the LLM.
    Used for local dev when no GPU is available.
    Mirrors the logic in rag_knowledge_base.csv RAG004.
    """
    wait = patient.get("wait_weeks", 0)
    contacted = patient.get("ever_contacted", True)
    imd = patient.get("imd_quintile", 5)

    if (wait > 52 and not contacted) or (imd == 1 and wait > 26 and not contacted):
        level, score = "high", 0.92
        reason = (
            f"Patient has waited {wait} weeks with no contact and lives in IMD Q{imd} "
            f"({patient['borough']}). Meets high-risk composite criteria (RAG004)."
        )
        action = "Flag for urgent clinical review"
    elif patient.get("pathway_changed") and wait > 20:
        level, score = "medium", 0.65
        reason = f"Pathway changed after {wait} weeks. Requires reassessment."
        action = "Pathway re-assessment"
    else:
        level, score = "low", 0.3
        reason = "No immediate high-risk criteria met."
        action = "Routine monitoring"

    return {"risk_level": level, "risk_score": score, "reason": reason, "recommended_action": action}


def _llm_triage(patient: dict, context: str) -> dict:
    """Calls Nemotron via vLLM for a real risk assessment."""
    client = _get_llm_client()

    prompt = f"""You are a clinical triage assistant for an NHS waiting list coordination system.

Patient data:
- ID: {patient['patient_id']}
- Name: {patient['name']}, Age: {patient['age']}
- Condition: {patient['condition']}
- Wait: {patient['wait_weeks']} weeks
- Ever contacted: {patient['ever_contacted']}, Days since last contact: {patient['days_since_contact']}
- Borough: {patient['borough']}, IMD Quintile: {patient['imd_quintile']}
- Pathway changed: {patient['pathway_changed']}

Relevant NHS guidelines and context:
{context}

Return a JSON object with exactly these keys:
- risk_level: "high", "medium", or "low"
- risk_score: float between 0 and 1
- reason: one paragraph explaining the assessment
- recommended_action: one of the five approved actions from the coordinator action menu

JSON only, no extra text."""

    response = client.chat.completions.create(
        model=VLLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=400,
    )
    return json.loads(response.choices[0].message.content)


def run(state: dict) -> dict:
    """
    state keys consumed: flagged_patients, scan_run_id, event_queue
    state keys produced: triage_results (list of dicts)
    """
    con = duckdb.connect(DB_PATH)
    scan_id = state["scan_run_id"]
    emit = g.EVENT_QUEUES.get(scan_id, []).append
    results = []

    def event(agent, event_type, message, patient_id=""):
        emit({
            "event_id": f"EVT{__import__('uuid').uuid4().hex[:6].upper()}",
            "scan_run_id": scan_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": agent,
            "event_type": event_type,
            "patient_id": patient_id,
            "message": message,
        })

    for patient in state["flagged_patients"]:
        pid = patient["patient_id"]

        event("triage", "rag_retrieval",
              f"Triage: retrieving NHS guidelines for {pid} ({patient['condition']}, {patient['age']}y, Q{patient['imd_quintile']})...",
              patient_id=pid)

        context = "" if MOCK_LLM else _retrieve_context(patient)

        event("triage", "llm_call",
              f"Triage: {'MOCK' if MOCK_LLM else 'Nemotron'} assessing risk for {pid}...",
              patient_id=pid)

        start_ms = datetime.now(timezone.utc).timestamp() * 1000
        assessment = _mock_triage(patient, context) if MOCK_LLM else _llm_triage(patient, context)
        inference_ms = int(datetime.now(timezone.utc).timestamp() * 1000 - start_ms)

        triage_row = {
            "triage_id": f"TRG{__import__('uuid').uuid4().hex[:6].upper()}",
            "scan_run_id": scan_id,
            "patient_id": pid,
            "risk_level": assessment["risk_level"],
            "risk_score": assessment["risk_score"],
            "reason": assessment["reason"],
            "recommended_action": assessment["recommended_action"],
            "flags_triggered": patient.get("flag_reasons", ""),
            "triaged_timestamp": datetime.now(timezone.utc).isoformat(),
        }
        results.append(triage_row)

        # Write to DuckDB immediately so the dashboard can query it
        cols = ", ".join(triage_row.keys())
        placeholders = ", ".join(["?" for _ in triage_row])
        con.execute(
            f"INSERT INTO triage_results ({cols}) VALUES ({placeholders})",
            list(triage_row.values())
        )

        event("triage", "result",
              f"Triage complete for {pid}: {assessment['risk_level'].upper()} risk (score {assessment['risk_score']}). {assessment['recommended_action']}",
              patient_id=pid)

    con.close()
    state["triage_results"] = results
    return state
