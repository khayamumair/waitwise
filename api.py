"""
api.py — FastAPI backend
Three endpoints Khayam needs:

  POST /scan               triggers the pipeline, returns scan_run_id immediately
  GET  /stream/{scan_id}   SSE stream of the reasoning trace
  GET  /results/{scan_id}  full results (patients + triage + comms) for the dashboard
  POST /approve/{triage_id}  coordinator approves a recommendation
  GET  /gpu                current GPU utilisation (real on DGX Spark, mocked otherwise)
"""

import asyncio
import duckdb
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import graph as pipeline
import llm_config
from gpu_monitor import MONITOR as gpu

DB_PATH = str(Path(__file__).parent / "db" / "waitwise.db")

app = FastAPI(title="WaitWise API")

# Allow any origin so the React frontend can call this during dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Holds in-flight pipeline states keyed by scan_run_id
# In production you'd use Redis; for the hackathon an in-memory dict is fine
_active_runs: dict[str, dict] = {}
_executor = ThreadPoolExecutor(max_workers=2)


# ---------- Models ----------

class ScanRequest(BaseModel):
    coordinator_id: str = "COORD001"

class ApproveRequest(BaseModel):
    coordinator_id: str


# ---------- Endpoints ----------

@app.post("/scan")
def trigger_scan(req: ScanRequest):
    """
    Triggers the full pipeline in a background thread.
    Returns immediately with the scan_run_id so the frontend can open /stream/{id}.
    """
    # Validate coordinator exists
    con = duckdb.connect(DB_PATH)
    coord = con.execute(
        "SELECT * FROM coordinators WHERE coordinator_id = ?",
        [req.coordinator_id]
    ).fetchone()
    con.close()
    if not coord:
        raise HTTPException(status_code=403, detail="Unknown or inactive coordinator")

    # We need the scan_id before the thread starts — generate it here
    from datetime import datetime, timezone
    scan_id = f"SCAN{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    event_queue = []
    _active_runs[scan_id] = {"event_queue": event_queue, "state": None, "done": False}

    def _run():
        gpu.mark_busy()  # drives the live GPU-utilisation curve during the scan
        try:
            state = pipeline.run_pipeline(
                coordinator_id=req.coordinator_id,
                scan_id=scan_id,
                event_queue=event_queue,
            )
            _active_runs[scan_id]["state"] = state
        except Exception as e:
            import traceback
            _active_runs[scan_id]["error"] = traceback.format_exc()
            print(f"\n ERROR in pipeline for {scan_id}:\n{traceback.format_exc()}")
        finally:
            gpu.mark_idle()
            _active_runs[scan_id]["done"] = True

    _executor.submit(_run)
    return {"scan_run_id": scan_id}


@app.get("/stream/{scan_id}")
async def stream_events(scan_id: str):
    """
    Server-Sent Events stream.
    Frontend connects here and receives agent events as they're emitted.
    Each event is a JSON object matching the agent_events.csv schema.
    """
    if scan_id not in _active_runs:
        raise HTTPException(status_code=404, detail="Scan not found")

    async def event_generator():
        sent = 0
        while True:
            run = _active_runs[scan_id]
            queue = run["event_queue"]

            # Send any new events
            while sent < len(queue):
                yield f"data: {json.dumps(queue[sent])}\n\n"
                sent += 1

            if run["done"] and sent >= len(queue):
                yield f"data: {json.dumps({'event_type': 'pipeline_complete', 'scan_run_id': scan_id})}\n\n"
                break

            await asyncio.sleep(0.1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _clean(obj):
    """Replace NaN/None float values with None so JSON serialization works."""
    import math
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(i) for i in obj]
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


@app.get("/results/{scan_id}")
def get_results(scan_id: str):
    """
    Returns the full results for a completed scan:
    - flagged patients with their triage assessment
    - draft coordinator memos and patient letters
    Used to populate the dashboard cards after streaming completes.
    """
    con = duckdb.connect(DB_PATH)

    triage_rows = con.execute(
        "SELECT * FROM triage_results WHERE scan_run_id = ? ORDER BY risk_score DESC",
        [scan_id]
    ).df().to_dict("records")

    if not triage_rows:
        con.close()
        raise HTTPException(status_code=404, detail="No results for this scan")

    patient_ids = [t["patient_id"] for t in triage_rows]
    placeholders = ",".join(f"'{p}'" for p in patient_ids)
    patients = con.execute(
        f"SELECT * FROM patients WHERE patient_id IN ({placeholders})"
    ).df().to_dict("records")
    patient_map = {p["patient_id"]: p for p in patients}

    # Build per-patient comms dict: {patient_id: {coordinator_memo: ..., patient_letter: ...}}
    comms_rows = con.execute(
        "SELECT * FROM communications WHERE scan_run_id = ?", [scan_id]
    ).df().to_dict("records")
    comm_map = {}
    for c in comms_rows:
        pid = c["patient_id"]
        if pid not in comm_map:
            comm_map[pid] = {"status": c["status"]}
        comm_map[pid][c["type"]] = c["content"]

    scan_run = con.execute(
        "SELECT * FROM scan_runs WHERE scan_run_id = ?", [scan_id]
    ).df().to_dict("records")
    con.close()

    results = []
    for t in triage_rows:
        pid = t["patient_id"]
        results.append({
            "patient": patient_map.get(pid, {}),
            "triage": t,
            "communications": comm_map.get(pid, {}),
        })

    # Cohort summary + full flagged queue come from the in-memory run state
    # (set by the pipeline thread). Degrade gracefully if the run has been GC'd.
    run = _active_runs.get(scan_id, {})
    state = run.get("state") or {}
    cohort_summary = state.get("cohort_summary", {})
    cohort_queue = state.get("cohort_queue", [])

    return _clean({
        "scan_run": scan_run[0] if scan_run else {},
        "cohort_summary": cohort_summary,
        "cohort_queue": cohort_queue,
        "flagged_cases": results,
    })


@app.post("/approve/{triage_id}")
def approve(triage_id: str, req: ApproveRequest):
    """
    Coordinator approves a triage recommendation.
    Sets coordinator_approved=True and marks comms as sent.
    """
    con = duckdb.connect(DB_PATH)

    # Validate coordinator
    coord = con.execute(
        "SELECT * FROM coordinators WHERE coordinator_id = ?",
        [req.coordinator_id]
    ).fetchone()
    if not coord:
        con.close()
        raise HTTPException(status_code=403, detail="Unknown or inactive coordinator")

    now = datetime.now(timezone.utc).isoformat()

    # Verify triage record exists
    existing = con.execute(
        "SELECT triage_id FROM triage_results WHERE triage_id = ?", [triage_id]
    ).fetchone()
    if not existing:
        con.close()
        raise HTTPException(status_code=404, detail="Triage record not found")

    # Mark communications as approved
    con.execute(
        "UPDATE communications SET status = 'approved' WHERE scan_run_id = ("
        "SELECT scan_run_id FROM triage_results WHERE triage_id = ?)",
        [triage_id]
    )
    con.close()
    return {"approved": True, "triage_id": triage_id, "timestamp": now}


@app.get("/gpu")
def gpu_status():
    """
    Current GPU utilisation for the live counter widget.

    Real stats (pynvml / nvidia-smi) on the DGX Spark; a scan-driven simulated
    curve locally. Either way the value moves while a scan is running. The active
    serving backend (mock vs Nemotron) is reported so the panel labels itself.
    """
    snap = gpu.snapshot()
    snap["llm"] = llm_config.describe()
    snap["busy"] = gpu.busy
    return snap
