"""
graph.py — LangGraph pipeline
Defines the Monitor → Triage → Communication flow as a state graph.
Each node is one of the agent run() functions.

Event queues are stored in a module-level dict keyed by scan_id.
This avoids LangGraph's state deep-copy breaking the shared list reference.
"""

import duckdb
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict
from langgraph.graph import StateGraph, END

from agents import monitor, triage, communication

DB_PATH = str(Path(__file__).parent / "db" / "waitwise.db")

# Module-level store — agents import and write to this directly
EVENT_QUEUES: dict[str, list] = {}


class PipelineState(TypedDict):
    scan_run_id: str
    coordinator_id: str
    flagged_patients: list
    triage_results: list
    communications: list
    total_scanned: int


def build_graph():
    g = StateGraph(PipelineState)
    g.add_node("monitor", monitor.run)
    g.add_node("triage", triage.run)
    g.add_node("communication", communication.run)
    g.add_edge("monitor", "triage")
    g.add_edge("triage", "communication")
    g.add_edge("communication", END)
    g.set_entry_point("monitor")
    return g.compile()


def run_pipeline(
    coordinator_id: str = "COORD001",
    scan_id: str = None,
    event_queue: list = None,
) -> dict:
    """
    Runs the full pipeline synchronously and returns the final state.
    scan_id and event_queue are injected by the API.
    The queue is stored in EVENT_QUEUES so agents can write to it
    without relying on LangGraph state passing.
    """
    con = duckdb.connect(DB_PATH)
    if scan_id is None:
        scan_id = f"SCAN{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    if event_queue is None:
        event_queue = []

    # Register queue so agents can find it by scan_id
    EVENT_QUEUES[scan_id] = event_queue
    start_time = datetime.now(timezone.utc)

    # Write scan_runs row at start
    con.execute("""
        INSERT INTO scan_runs (scan_run_id, started_at, status)
        VALUES (?, ?, 'running')
    """, [scan_id, start_time.isoformat()])
    con.close()

    initial_state: PipelineState = {
        "scan_run_id": scan_id,
        "coordinator_id": coordinator_id,
        "flagged_patients": [],
        "triage_results": [],
        "communications": [],
        "total_scanned": 0,
    }

    graph = build_graph()
    final_state = graph.invoke(initial_state)

    # Update scan_runs row at end
    end_time = datetime.now(timezone.utc)
    total_ms = int((end_time - start_time).total_seconds() * 1000)
    n_flagged = len(final_state["flagged_patients"])
    n_high = sum(1 for t in final_state["triage_results"] if t["risk_level"] == "high")
    n_medium = sum(1 for t in final_state["triage_results"] if t["risk_level"] == "medium")

    con = duckdb.connect(DB_PATH)
    con.execute("""
        UPDATE scan_runs SET
            finished_at = ?,
            patients_scanned = ?,
            patients_flagged = ?,
            patients_triaged = ?,
            duration_seconds = ?,
            status = 'completed'
        WHERE scan_run_id = ?
    """, [end_time.isoformat(), final_state["total_scanned"], n_flagged, n_high + n_medium, total_ms / 1000, scan_id])
    con.close()

    return final_state
