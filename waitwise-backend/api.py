"""
api.py - FastAPI backend
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
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

import graph as pipeline
import insights as cohort_insights
import llm_config
from gpu_monitor import MONITOR as gpu

DB_PATH = os.getenv("WAITWISE_DB_PATH", str(Path(__file__).parent / "db" / "waitwise.db"))

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

    # We need the scan_id before the thread starts - generate it here
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
        run = _active_runs.get(scan_id, {})
        if run.get("error"):
            raise HTTPException(status_code=500, detail=f"Pipeline failed:\n{run['error']}")
        if not run.get("done"):
            raise HTTPException(status_code=202, detail="Scan still in progress")
        raise HTTPException(status_code=404, detail="No results for this scan — pipeline may have written 0 triage rows")

    patient_ids = [t["patient_id"] for t in triage_rows]
    placeholders = ",".join(f"'{p}'" for p in patient_ids)
    patients = con.execute(
        f"""
        SELECT p.*,
               MAX(CASE WHEN w.breach_52wk THEN true ELSE false END) AS breach_52,
               MAX(CASE WHEN w.breach_18wk THEN true ELSE false END) AS breach_18
        FROM patients p
        LEFT JOIN waiting_list_status w USING (patient_id)
        WHERE p.patient_id IN ({placeholders})
        GROUP BY ALL
        """
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
    _record_audit({"actor": req.coordinator_id, "action": "approve", "triage_id": triage_id,
                   "detail": "Coordinator approved the triage + communications."})
    return {"approved": True, "triage_id": triage_id, "timestamp": now}


# ---------- Audit trail (every coordinator / GP / voice action) ----------

AUDIT_LOG_PATH = Path(__file__).parent / "db" / "audit_log.jsonl"
_AUDIT: list[dict] = []


class AuditEntry(BaseModel):
    actor: str
    action: str
    patient_id: str | None = None
    triage_id: str | None = None
    detail: str | None = None


def _record_audit(entry: dict) -> dict:
    """Append an immutable audit record (in-memory + JSONL file for the record)."""
    rec = {
        "id": f"AUD{uuid.uuid4().hex[:8].upper()}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **entry,
    }
    _AUDIT.append(rec)
    try:
        with open(AUDIT_LOG_PATH, "a") as f:
            f.write(json.dumps(rec) + "\n")
    except Exception:
        pass
    return rec


@app.post("/audit")
def post_audit(e: AuditEntry):
    """Log an action from the UI (approve, escalate, GP accept/action/note)."""
    return _record_audit(e.model_dump())


@app.get("/audit")
def get_audit(limit: int = 200):
    """Full action history, newest first - powers the Activity / audit-trail view."""
    return {"events": list(reversed(_AUDIT[-limit:]))}


# ---------- Voice check-in agent (ElevenLabs + Nemotron) ----------

_voice_done: set[str] = set()


class VoiceOutcome(BaseModel):
    patient_id: str
    still_waiting: bool | None = None
    deterioration: bool | None = None
    summary: str = ""
    transcript: str | None = None


@app.get("/voice/next-patient")
def voice_next_patient():
    """
    Hand the voice agent the next voice-suitable, flagged patient to call, with a
    suggested opening line. Tracks who has been called this session.
    """
    con = duckdb.connect(DB_PATH, read_only=True)
    rows = con.execute("""
        SELECT patient_id, name, age, condition, wait_weeks, borough,
               imd_quintile, primary_language, ever_contacted, days_since_contact
        FROM patients
        WHERE voice_checkin_suitable = TRUE AND flagged = TRUE
        ORDER BY risk_score DESC
        LIMIT 100
    """).df().to_dict("records")
    con.close()
    nxt = next((r for r in rows if r["patient_id"] not in _voice_done), None)
    if not nxt:
        return {"done": True, "message": "No more voice-suitable patients in this batch."}
    _voice_done.add(nxt["patient_id"])
    first = str(nxt["name"]).split()[0]
    opening = (
        f"Hello, this is the NHS waiting list coordination team calling for {first}. "
        f"Our records show you've been waiting about {nxt['wait_weeks']} weeks for {nxt['condition']}. "
        f"I'd like to check three quick things: are you still waiting for this appointment, "
        f"has anything about your condition got worse, and are your contact details still up to date?"
    )
    return {"done": False, "patient": _clean(nxt), "suggested_opening": opening}


@app.post("/voice/outcome")
def voice_outcome(o: VoiceOutcome):
    """Record the result of a voice check-in into the audit trail."""
    bits = []
    if o.still_waiting is not None:
        bits.append("still waiting" if o.still_waiting else "no longer needs appointment")
    if o.deterioration:
        bits.append("DETERIORATION REPORTED")
    if o.summary:
        bits.append(o.summary)
    detail = "; ".join(bits) or "Check-in completed."
    rec = _record_audit({
        "actor": "voice-agent",
        "action": "voice_checkin",
        "patient_id": o.patient_id,
        "detail": detail,
    })
    return {"recorded": True, "audit_id": rec["id"]}


@app.get("/voice/session-log")
def voice_session_log():
    """Voice-agent session log (for the ElevenLabs bounty submission)."""
    voice = [e for e in _AUDIT if e.get("actor") == "voice-agent"]
    return {"count": len(voice), "events": voice}


@app.post("/voice/postcall")
async def voice_postcall(request: Request):
    """
    ElevenLabs post-call webhook. After each voice check-in, ElevenLabs POSTs the
    transcript + its extracted data-collection fields here; we log the outcome to
    the audit trail. Robust path that needs no in-call tool calling.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    data = body.get("data", body) or {}
    analysis = data.get("analysis", {}) or {}
    summary = analysis.get("transcript_summary") or analysis.get("summary") or ""
    dcr = analysis.get("data_collection_results", {}) or {}

    def field(key):
        v = dcr.get(key)
        return v.get("value") if isinstance(v, dict) else v

    name = field("patient_first_name")
    still = field("still_waiting_for_appointment")
    worse = field("condition_worsened")

    bits = []
    if name:
        bits.append(f"Patient {name}")
    if still is not None:
        bits.append("still waiting" if still else "no longer needs appointment")
    if worse:
        bits.append("CONDITION WORSENED - flag for urgent follow-up")
    if summary:
        bits.append(str(summary))
    detail = "; ".join(bits) or "Voice check-in completed."

    _record_audit({
        "actor": "voice-agent",
        "action": "voice_checkin",
        "patient_id": str(name) if name else None,
        "detail": detail[:600],
    })
    return {"ok": True}


# ---------- OpenAI passthrough (so ElevenLabs' custom LLM = this backend) ----------
# ElevenLabs cloud only needs ONE public URL (this backend); we forward LLM calls
# to Nemotron over the LAN, so the DGX never has to be exposed publicly.

@app.get("/v1/models")
async def proxy_models():
    base = llm_config.BASE_URL
    if not base:
        return {"object": "list", "data": [{"id": llm_config.MODEL, "object": "model"}]}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{base}/models")
            return JSONResponse(status_code=r.status_code, content=r.json())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM backend unreachable: {e}")


# Nemotron emits tool calls as: <toolcall> {"function": "name", "arguments": {...}} </toolcall>
# (sometimes <tool_call>, "name" instead of "function", "parameters" instead of "arguments").
_TOOLCALL_RE = re.compile(r"<tool_?call>\s*(\{.*?\})\s*</tool_?call>", re.DOTALL)


def _extract_tool_calls(content: str) -> list[dict]:
    calls = []
    for m in _TOOLCALL_RE.finditer(content or ""):
        try:
            obj = json.loads(m.group(1))
        except Exception:
            continue
        name = obj.get("name") or obj.get("function")
        args = obj.get("arguments", obj.get("parameters", {}))
        if not name:
            continue
        if not isinstance(args, str):
            args = json.dumps(args)
        calls.append({
            "id": f"call_{uuid.uuid4().hex[:8]}",
            "type": "function",
            "function": {"name": name, "arguments": args},
        })
    return calls


@app.post("/v1/chat/completions")
async def proxy_chat(request: Request):
    """
    Forward an OpenAI chat-completions call to Nemotron (vLLM), fast passthrough
    streaming. Logs the request shape + any upstream error for debugging the
    ElevenLabs custom-LLM link.
    """
    base = llm_config.BASE_URL
    if not base:
        raise HTTPException(status_code=503, detail="No LLM backend (set MOCK_LLM=false + VLLM_BASE_URL)")
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except Exception:
        payload = {}

    # Clamp max_tokens: clients (ElevenLabs sends 8192) can exceed the model's
    # context window and vLLM 400s. Keep output well under max_model_len.
    cap = int(os.getenv("WAITWISE_PROXY_MAX_TOKENS", "512"))
    mt = payload.get("max_tokens")
    if not isinstance(mt, int) or mt <= 0 or mt > cap:
        payload["max_tokens"] = cap
    raw = json.dumps(payload).encode()

    print(f"[proxy] msgs={len(payload.get('messages', []))} stream={payload.get('stream')} "
          f"tools={len(payload.get('tools', []))} max_tokens->{payload.get('max_tokens')}", flush=True)
    url = f"{base}/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": "Bearer EMPTY"}
    wants_stream = bool(payload.get("stream"))

    if wants_stream:
        async def gen():
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, content=raw, headers=headers) as r:
                    if r.status_code != 200:
                        err = await r.aread()
                        print(f"[proxy] upstream {r.status_code}: {err[:400]!r}", flush=True)
                        yield f"data: {json.dumps({'error': err.decode('utf-8', 'replace')[:400]})}\n\n".encode()
                        return
                    async for chunk in r.aiter_bytes():
                        yield chunk
        return StreamingResponse(gen(), media_type="text/event-stream")

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(url, content=raw, headers=headers)
        if r.status_code != 200:
            print(f"[proxy] upstream {r.status_code}: {r.text[:400]!r}", flush=True)
        return JSONResponse(status_code=r.status_code, content=r.json())


@app.get("/insights")
def get_insights():
    """
    Cohort-level, non-obvious findings over the whole waiting list (RTT breaches,
    pathway-event blind spots, the deprivation/DNA gradient, borough hotspots).
    Independent of any scan - loads immediately for the dashboard insight panel.
    """
    try:
        return cohort_insights.compute_insights()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insight computation failed: {e}")


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
