"""
conftest.py — pytest fixtures for WaitWise smoke tests.

Sets env vars at MODULE LEVEL (before any app imports) so DB_PATH,
LLM mode, and caps are all baked in at import time.
"""

import os
import shutil
import pathlib

_REAL_DB = pathlib.Path(__file__).parent.parent / "db" / "waitwise.db"
_TEST_DB = "/tmp/waitwise_test.db"

# ── Must be set BEFORE any app imports (evaluated at collection time) ────────
os.environ["WAITWISE_LLM"] = "mock"
os.environ["WAITWISE_TRIAGE_HIGH_CAP"] = "3"
os.environ.setdefault("WAITWISE_TRIAGE_MEDIUM_CAP", "2")
os.environ["WAITWISE_COMMS_CAP"] = "2"
os.environ["WAITWISE_MOCK_DELAY_MS"] = "0"
os.environ["WAITWISE_DB_PATH"] = _TEST_DB

# Copy DB immediately (module-level, runs at collection time).
shutil.copy2(str(_REAL_DB), _TEST_DB)
