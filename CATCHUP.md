# WaitWise — Frontend Dev Catch-Up

## What It Is

An NHS waiting list management tool. A coordinator triggers a scan; three AI agents run in sequence to identify at-risk patients, assess them, and draft communications. The React frontend consumes a fully-working FastAPI backend.

---

## The Backend (already built)

**3-agent pipeline** wired via LangGraph:

1. **Monitor** (`agents/monitor.py`) — Pure SQL rule engine. Scores all ~500+ patients on risk heuristics (wait length, deprivation quintile, contact history, pathway changes). Returns top 3 worst cases. No LLM.

2. **Triage** (`agents/triage.py`) — RAG + LLM. Retrieves relevant NHS guidelines from ChromaDB via semantic search, then calls an LLM (Nemotron on DGX Spark, or llama3.2 locally, or a mock) to produce `risk_level`, `risk_score`, `reason`, `recommended_action`.

3. **Communication** (`agents/communication.py`) — LLM (or mock). Writes two items per patient: a **clinical memo** for the coordinator and a **compassionate letter** for the patient.

Results are persisted to **DuckDB** at `db/waitwise.db`. Embeddings live in **ChromaDB** at `vector_store/`.

---

## The 5 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/scan` | Start pipeline; returns `scan_run_id` immediately |
| `GET` | `/stream/{scan_run_id}` | SSE stream — live reasoning trace as agents run |
| `GET` | `/results/{scan_run_id}` | Full results once `pipeline_complete` event fires |
| `POST` | `/approve/{triage_id}` | Coordinator approves a case |
| `GET` | `/gpu` | GPU utilisation for live counter widget |

Base URL: `http://localhost:8080`

---

## SSE Event Flow

```
pipeline_start → scan_start → rule_check (×N) → flag (×3)
→ scan_complete → rag_retrieval → llm_call → result (×3)
→ drafting → drafted (×3) → pipeline_complete
```

When `pipeline_complete` arrives, close the stream and call `/results`.

**`agent` values:** `orchestrator`, `monitor`, `triage`, `communication`

**`event_type` values:** `pipeline_start`, `scan_start`, `rule_check`, `flag`, `scan_complete`, `rag_retrieval`, `llm_call`, `result`, `drafting`, `drafted`, `pipeline_complete`

---

## Data Models

**Patient** key fields: `patient_id`, `name`, `age`, `sex`, `borough`, `imd_quintile`, `condition`, `wait_weeks`, `ever_contacted`, `referral_type`

**Triage result**: `triage_id`, `risk_level` (`high`/`medium`/`low`), `risk_score` (0–1), `reason`, `recommended_action`

**Communications**: Two rows per patient — `type: "coordinator_memo"` (internal clinical brief) and `type: "patient_letter"` (plain-English patient-facing). `status` starts as `"draft"`, becomes `"approved"` after coordinator approves.

**Coordinators**: `CO001` Sarah Mensah, `CO002` Tom Bradley — use these as `coordinator_id` in requests.

---

## Example `/results` Response Shape

```json
{
  "scan_run": {
    "scan_run_id": "SCAN20260602_143022",
    "total_patients_scanned": 503,
    "patients_flagged": 3,
    "high_risk_count": 3,
    "total_pipeline_ms": 196,
    "status": "completed"
  },
  "flagged_cases": [
    {
      "patient": { "patient_id": "P0119", "name": "Ava Cooper", "age": 50, "borough": "Tower Hamlets", "condition": "Cardiology", "wait_weeks": 120, "ever_contacted": false, "imd_quintile": 1 },
      "triage": { "triage_id": "TRGCE4A99", "risk_level": "high", "risk_score": 0.92, "reason": "...", "recommended_action": "Flag for urgent clinical review", "coordinator_approved": false },
      "communications": { "comm_id": "COMM5D43DE", "coordinator_memo": "URGENT — Ava Cooper (P0119)...", "patient_letter": "Dear Ava,\n\nWe are writing...", "sent": false }
    }
  ]
}
```

Cases are ordered by `risk_score` descending — highest risk first.

---

## Frontend Notes

- CORS is wide open (`allow_origins=["*"]`) — no proxy config needed
- Server runs on **port 8080**: `python -m uvicorn api:app --reload --port 8080`
- Mock LLM/GPU are on by default — everything works without GPU hardware
- To use a real LLM: set `MOCK_LLM = False` in `agents/triage.py` and `agents/communication.py`
- Poll `/gpu` every 2 seconds for the live GPU counter widget
- On `/approve` success: update the patient card to "Approved" state and disable the approve button
