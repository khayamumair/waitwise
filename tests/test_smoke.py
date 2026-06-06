"""
Smoke tests for the WaitWise backend.

Run from waitwise-backend/:
    pytest tests/test_smoke.py -v

All tests use mock mode — no GPU or DGX required.
"""

import os
import sys
import pytest

# Force mock mode for all tests — no real LLM needed.
os.environ.setdefault("WAITWISE_LLM", "mock")
os.environ.setdefault("WAITWISE_TRIAGE_HIGH_CAP", "3")
os.environ.setdefault("WAITWISE_COMMS_CAP", "2")

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Unit: triage mock output shape
# ---------------------------------------------------------------------------

class TestMockTriage:
    from agents.triage import _mock_triage  # local import to avoid side-effects at module level

    _HIGH_PATIENT = {
        "patient_id": "P001",
        "name": "Test Patient",
        "age": 55,
        "condition": "Cardiology",
        "borough": "Islington",
        "wait_weeks": 60,
        "ever_contacted": False,
        "imd_quintile": 1,
        "pathway_changed": False,
    }
    _LOW_PATIENT = {**_HIGH_PATIENT, "wait_weeks": 10, "ever_contacted": True, "imd_quintile": 5}

    def test_high_risk_shape(self):
        from agents.triage import _mock_triage
        result = _mock_triage(self._HIGH_PATIENT, context="")
        assert result["risk_level"] == "high"
        assert 0 < result["risk_score"] <= 1
        assert result["reason"]
        assert result["recommended_action"]

    def test_low_risk_shape(self):
        from agents.triage import _mock_triage
        result = _mock_triage(self._LOW_PATIENT, context="")
        assert result["risk_level"] == "low"
        assert 0 < result["risk_score"] < 0.5

    def test_required_keys_present(self):
        from agents.triage import _mock_triage
        for patient in (self._HIGH_PATIENT, self._LOW_PATIENT):
            result = _mock_triage(patient, context="")
            assert set(result.keys()) >= {"risk_level", "risk_score", "reason", "recommended_action"}

    def test_risk_level_values(self):
        from agents.triage import _mock_triage
        result = _mock_triage(self._HIGH_PATIENT, context="")
        assert result["risk_level"] in ("high", "medium", "low")


# ---------------------------------------------------------------------------
# Unit: communication mock output format
# ---------------------------------------------------------------------------

class TestMockComms:
    _PATIENT = {
        "patient_id": "P001",
        "name": "Alice Smith",
        "age": 55,
        "condition": "Cardiology",
        "borough": "Islington",
        "wait_weeks": 60,
        "ever_contacted": False,
        "imd_quintile": 1,
        "primary_language": "English",
        "multilingual_required": False,
    }
    _TRIAGE = {"risk_level": "high", "risk_score": 0.92, "reason": "Long wait", "recommended_action": "Urgent review"}

    def test_memo_has_structured_sections(self):
        from agents.communication import _mock_comms
        memo, letter = _mock_comms(self._PATIENT, self._TRIAGE)
        assert "SUMMARY:" in memo
        assert "KEY RISKS:" in memo
        assert "RECOMMENDED ACTION:" in memo

    def test_memo_high_risk_is_urgent(self):
        from agents.communication import _mock_comms
        memo, _ = _mock_comms(self._PATIENT, self._TRIAGE)
        assert "URGENT" in memo

    def test_letter_addressed_to_patient(self):
        from agents.communication import _mock_comms
        _, letter = _mock_comms(self._PATIENT, self._TRIAGE)
        assert "Alice" in letter  # first name
        assert "NHS" in letter

    def test_both_returned_non_empty(self):
        from agents.communication import _mock_comms
        memo, letter = _mock_comms(self._PATIENT, self._TRIAGE)
        assert len(memo) > 20
        assert len(letter) > 20


# ---------------------------------------------------------------------------
# Integration: API /results schema
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    """Spin up a TestClient backed by the FastAPI app (in-process, no network)."""
    from fastapi.testclient import TestClient
    import api
    return TestClient(api.app)


def test_health(client):
    """Basic liveness check."""
    resp = client.get("/gpu")
    assert resp.status_code == 200
    data = resp.json()
    assert "gpu_utilisation_pct" in data


def test_insights_schema(client):
    resp = client.get("/insights")
    assert resp.status_code == 200
    data = resp.json()
    assert "insights" in data
    assert isinstance(data["insights"], list)
    if data["insights"]:
        insight = data["insights"][0]
        for key in ("id", "severity", "title", "stat", "headline"):
            assert key in insight, f"Missing key: {key}"


def test_scan_and_results_roundtrip(client):
    """
    POST /scan → poll /results until pipeline completes.
    Uses mock mode + low caps so it completes in <20s.
    """
    import time

    resp = client.post("/scan", json={"coordinator_id": "CO001"})
    assert resp.status_code == 200
    scan_id = resp.json()["scan_run_id"]
    assert scan_id

    # Poll for results — mock pipeline typically finishes in 2-5s.
    deadline = time.time() + 30
    results_resp = None
    while time.time() < deadline:
        time.sleep(0.5)
        r = client.get(f"/results/{scan_id}")
        if r.status_code == 200:
            results_resp = r
            break

    assert results_resp is not None, "Pipeline did not complete within 30s"
    data = results_resp.json()

    assert "flagged_cases" in data
    assert isinstance(data["flagged_cases"], list)
    assert len(data["flagged_cases"]) > 0

    case = data["flagged_cases"][0]
    assert "patient" in case
    assert "triage" in case
    assert "communications" in case

    patient = case["patient"]
    for key in ("patient_id", "name", "condition", "borough", "wait_weeks", "imd_quintile"):
        assert key in patient, f"Missing patient field: {key}"

    triage = case["triage"]
    assert triage["risk_level"] in ("high", "medium", "low")
    assert 0 <= triage["risk_score"] <= 1
    assert triage["reason"]
    assert triage["recommended_action"]

    assert "cohort_summary" in data
    assert data["cohort_summary"].get("n_flagged", 0) > 0
