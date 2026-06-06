"""
triage.py — Triage Agent
Retrieves relevant NHS rules from ChromaDB, then calls the LLM (Nemotron on the
DGX Spark via vLLM, or the local mock) to assess each flagged patient.

v2: the cohort is now hundreds of patients, not three. Two changes make that
viable:
  1. The embedding model + Chroma client are loaded ONCE, not per patient.
  2. Triage runs as a CONCURRENT BATCH (ThreadPoolExecutor) — on vLLM this is
     what drives continuous batching and the live GPU-utilisation spike.

The serving backend is chosen entirely by llm_config (WAITWISE_LLM env var).
"""

import duckdb
import json
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from pathlib import Path
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
import graph as g
import llm_config

DB_PATH = os.getenv("WAITWISE_DB_PATH", str(Path(__file__).parent.parent / "db" / "waitwise.db"))
VECTOR_PATH = str(Path(__file__).parent.parent / "vector_store")

# Stream at most this many individual `result` lines to the live trace.
RESULT_EVENT_SAMPLE = 8


# --- Retrieval (built once per scan, reused across the whole batch) ----------

class _Retriever:
    """Holds the embedding fn + Chroma collections so they load once per scan."""

    def __init__(self):
        import chromadb
        from chromadb.utils import embedding_functions

        ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        client = chromadb.PersistentClient(path=VECTOR_PATH)
        self.rag = client.get_collection("rag_knowledge_base", embedding_function=ef)
        self.borough = client.get_collection("borough_deprivation", embedding_function=ef)

    def context_for(self, patient: dict) -> str:
        query = (
            f"{patient['condition']} patient, age {patient['age']}, "
            f"waited {patient['wait_weeks']} weeks, IMD quintile {patient['imd_quintile']}, "
            f"ever contacted: {patient['ever_contacted']}, borough: {patient['borough']}"
        )
        rag_results = self.rag.query(query_texts=[query], n_results=4)
        bw_results = self.borough.query(query_texts=[patient["borough"]], n_results=1)
        chunks = rag_results["documents"][0] + bw_results["documents"][0]
        return "\n".join(f"- {c}" for c in chunks)


# --- Assessment --------------------------------------------------------------

def _mock_triage(patient: dict, context: str) -> dict:
    """Deterministic result without the LLM. Mirrors rag_knowledge_base RAG004."""
    wait = patient.get("wait_weeks", 0)
    contacted = patient.get("ever_contacted", True)
    imd = patient.get("imd_quintile", 5)

    if (wait > 52 and not contacted) or (imd == 1 and wait > 26 and not contacted):
        level, score = "high", 0.92
        reason = (
            f"Patient has waited {wait} weeks with no contact and lives in IMD Q{imd} "
            f"({patient.get('borough', '')}). Meets high-risk composite criteria (RAG004)."
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


def _parse_json(text: str) -> dict:
    """Robustly extract the JSON object from an LLM response."""
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _llm_triage(patient: dict, context: str) -> dict:
    client = llm_config.get_client()
    prompt = f"""You are a clinical triage assistant for an NHS waiting list coordination system.

Patient data:
- ID: {patient['patient_id']}
- Name: {patient['name']}, Age: {patient['age']}
- Condition: {patient['condition']}
- Wait: {patient['wait_weeks']} weeks
- Ever contacted: {patient['ever_contacted']}, Days since last contact: {patient.get('days_since_contact', 'unknown')}
- Borough: {patient['borough']}, IMD Quintile: {patient['imd_quintile']}
- Pathway changed: {patient.get('pathway_changed')}

Relevant NHS guidelines and context:
{context}

Return a JSON object with exactly these keys:
- risk_level: "high", "medium", or "low"
- risk_score: float between 0 and 1
- reason: one paragraph explaining the assessment
- recommended_action: one of the five approved coordinator actions

JSON only, no extra text."""

    response = client.chat.completions.create(
        model=llm_config.MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=400,
    )
    return _parse_json(response.choices[0].message.content)


def _assess_one(patient: dict, retriever) -> tuple[dict, str | None]:
    """
    Retrieve + assess a single patient. Safe to run in a worker thread.
    Returns (assessment, fallback_error) — fallback_error is None on success, or
    the exception name if the LLM call failed and we fell back to the mock.
    """
    llm_config.mock_pace()  # watchable demo pacing (no-op for real backends)
    if llm_config.is_mock():
        return _mock_triage(patient, ""), None
    try:
        context = retriever.context_for(patient)
        return _llm_triage(patient, context), None
    except Exception as e:
        # Never let one unreachable/garbled LLM response crash the cohort —
        # fall back to the deterministic mock, but report it loudly.
        assessment = _mock_triage(patient, "")
        assessment["reason"] = f"[fallback: {type(e).__name__}] " + assessment["reason"]
        return assessment, type(e).__name__


def run(state: dict) -> dict:
    """
    state keys consumed: flagged_patients, scan_run_id
    state keys produced: triage_results (list of dicts)
    """
    con = duckdb.connect(DB_PATH)
    scan_id = state["scan_run_id"]
    emit = g.EVENT_QUEUES.get(scan_id, []).append
    patients = state["flagged_patients"]

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

    if not patients:
        con.close()
        state["triage_results"] = []
        return state

    retriever = None if llm_config.is_mock() else _Retriever()

    event("triage", "rag_retrieval",
          f"Triage: retrieving NHS guidance + grounding {len(patients)} flagged patients "
          f"({'mock' if llm_config.is_mock() else 'NeMo embeddings'})...")
    event("triage", "llm_call",
          f"Triage: dispatching {len(patients)} assessments to {llm_config.LABEL} "
          f"in batches of {llm_config.MAX_CONCURRENCY} (continuous batching)...")

    start = datetime.now(timezone.utc)

    # --- Concurrent batch: this is the GPU-saturating step --------------------
    assessments: list[tuple[dict, dict]] = []
    fallbacks: dict[str, int] = {}
    workers = 1 if llm_config.is_mock() else llm_config.MAX_CONCURRENCY
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_assess_one, p, retriever): p for p in patients}
        for fut in futures:
            assessment, fb = fut.result()
            assessments.append((futures[fut], assessment))
            if fb:
                fallbacks[fb] = fallbacks.get(fb, 0) + 1

    elapsed_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)

    # Loud, honest warning if the real model wasn't actually used. Without this a
    # scan silently degrades to mock when the DGX is unreachable.
    n_fb = sum(fallbacks.values())
    if n_fb and not llm_config.is_mock():
        reasons = ", ".join(f"{k}×{v}" for k, v in fallbacks.items())
        event("triage", "warning",
              f"⚠ {n_fb}/{len(patients)} assessments did NOT reach {llm_config.LABEL} "
              f"and fell back to the mock ({reasons}). Check the model server at "
              f"{llm_config.BASE_URL}.",
              n_fallback=n_fb)

    # --- Persist sequentially (single DuckDB connection) ----------------------
    results = []
    for patient, assessment in assessments:
        pid = patient["patient_id"]
        triage_row = {
            "triage_id": f"TRG{uuid.uuid4().hex[:6].upper()}",
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
        cols = ", ".join(triage_row.keys())
        placeholders = ", ".join(["?" for _ in triage_row])
        con.execute(
            f"INSERT INTO triage_results ({cols}) VALUES ({placeholders})",
            list(triage_row.values()),
        )

    # Sort by risk so the streamed sample shows the worst cases first.
    results.sort(key=lambda r: r["risk_score"], reverse=True)
    for r in results[:RESULT_EVENT_SAMPLE]:
        event("triage", "result",
              f"Triage complete for {r['patient_id']}: {r['risk_level'].upper()} risk "
              f"(score {r['risk_score']}). {r['recommended_action']}",
              patient_id=r["patient_id"])

    n_high = sum(1 for r in results if r["risk_level"] == "high")
    rate = round(len(results) / (elapsed_ms / 1000), 1) if elapsed_ms else len(results)
    event("triage", "result",
          f"Triage batch complete: {len(results)} patients assessed in {elapsed_ms} ms "
          f"(~{rate}/s) — {n_high} confirmed HIGH risk.",
          n_triaged=len(results), n_high=n_high, elapsed_ms=elapsed_ms)

    con.close()
    state["triage_results"] = results
    return state
