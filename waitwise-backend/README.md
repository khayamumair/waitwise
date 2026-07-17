# WaitWise Backend

## Setup (run once)

```bash
pip install -r requirements.txt
python ingest.py
```

This loads all CSVs into DuckDB and embeds the RAG knowledge base into ChromaDB.

---

## Running the server

**Dev mode (no GPU — works on any laptop):**
```bash
python -m uvicorn api:app --reload --port 8080
```

**With real Nemotron on the DGX Spark:**
```bash
# First start vLLM on the DGX (separate terminal):
# vllm serve nvidia/Nemotron-Mini-4B-Instruct --port 8000 --host 0.0.0.0

export WAITWISE_LLM=nemotron
export VLLM_BASE_URL=http://<DGX-IP>:8000/v1
export VLLM_MODEL=nvidia/Nemotron-Mini-4B-Instruct
python -m uvicorn api:app --port 8080
```

---

## API Reference — for the frontend developer

Base URL: `http://localhost:8080`

---

### POST `/scan`
Triggers the full agent pipeline. Returns immediately — pipeline runs in background.

**Request body:**
```json
{ "coordinator_id": "CO001" }
```

**Response:**
```json
{ "scan_run_id": "SCAN20260602_143022" }
```

**What to do:** save the `scan_run_id`, then immediately open the `/stream/{id}` connection.

**Valid coordinator IDs:** `CO001` (Sarah Mensah), `CO002` (Tom Bradley) — see `data/coordinators.csv`

---

### GET `/stream/{scan_run_id}`
Server-Sent Events stream. Connect here right after POST /scan to receive the live reasoning trace as the agents run.

**How to connect in React:**
```js
const es = new EventSource(`http://localhost:8080/stream/${scanRunId}`)
es.onmessage = (e) => {
  const event = JSON.parse(e.data)
  if (event.event_type === 'pipeline_complete') {
    es.close()
    fetchResults(scanRunId) // now call /results
  } else {
    appendToTrace(event) // render the reasoning step
  }
}
```

**Each event object looks like:**
```json
{
  "event_id": "EVT4A1C2B",
  "scan_run_id": "SCAN20260602_143022",
  "timestamp": "2026-06-02T14:30:22Z",
  "agent": "monitor",
  "event_type": "flag",
  "patient_id": "P0119",
  "message": "FLAGGED: P0119 — score 5, 120wk wait, ever_contacted=False, IMD Q1 Tower Hamlets"
}
```

**`agent` values:** `orchestrator`, `monitor`, `triage`, `communication`

**`event_type` values:** `pipeline_start`, `scan_start`, `rule_check`, `flag`, `scan_complete`, `rag_retrieval`, `llm_call`, `result`, `drafting`, `drafted`, `pipeline_complete`

---

### GET `/results/{scan_run_id}`
Returns the full results once the pipeline completes. Call this after the stream sends `pipeline_complete`.

**Response structure:**
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
      "patient": {
        "patient_id": "P0119",
        "name": "Ava Cooper",
        "age": 50,
        "borough": "Tower Hamlets",
        "condition": "Cardiology",
        "wait_weeks": 120,
        "ever_contacted": false,
        "imd_quintile": 1
      },
      "triage": {
        "triage_id": "TRGCE4A99",
        "risk_level": "high",
        "risk_score": 0.92,
        "reason": "Patient has waited 120 weeks with no contact...",
        "recommended_action": "Flag for urgent clinical review",
        "coordinator_approved": false
      },
      "communications": {
        "comm_id": "COMM5D43DE",
        "coordinator_memo": "URGENT — Ava Cooper (P0119)...",
        "patient_letter": "Dear Ava,\n\nWe are writing to update you...",
        "sent": false
      }
    }
  ]
}
```

**Cases are ordered by `risk_score` descending** — highest risk first.

---

### POST `/approve/{triage_id}`
Coordinator approves a recommendation. Sets `coordinator_approved = true` and marks the communication as sent.

**Request body:**
```json
{ "coordinator_id": "CO001" }
```

**Response:**
```json
{ "approved": true, "triage_id": "TRGCE4A99", "timestamp": "2026-06-02T14:31:00Z" }
```

**What to do in the UI:** on success, update the patient card to show "Approved" state and disable the approve button.

---

### GET `/gpu`
Returns current GPU utilisation. Poll every 2 seconds for the live counter on screen.

**Response:**
```json
{ "gpu_utilisation_pct": 67, "vram_used_gb": 8.4, "device": "DGX Spark GB10" }
```

---

## File structure

```
waitwise/
├── data/                    # all mock CSVs (source of truth)
├── db/waitwise.db           # DuckDB — created by ingest.py
├── vector_store/            # ChromaDB — created by ingest.py
├── agents/
│   ├── monitor.py           # SQL-only: scores + ranks patients, returns top 3
│   ├── triage.py            # RAG retrieval + LLM risk assessment
│   └── communication.py    # LLM memo and letter generation
├── graph.py                 # LangGraph: wires agents, manages state + event queue
├── api.py                   # FastAPI: all HTTP endpoints
├── ingest.py                # One-time setup: loads CSVs → DuckDB + ChromaDB
└── requirements.txt
```

## Switching from mock to real LLM

Serving is controlled entirely by environment variables (see `llm_config.py`):

```bash
WAITWISE_LLM=mock      # default — deterministic, no GPU needed
WAITWISE_LLM=nemotron  # vLLM/NIM on the DGX Spark (set VLLM_BASE_URL / VLLM_MODEL)
WAITWISE_LLM=ollama    # local llama3.2 via Ollama (dev fallback)
```

No code edits needed. The API response shape is identical in all modes.
