"""
llm_config.py — single source of truth for LLM serving.

The whole point of this module: switching from the local mock to Nemotron on the
DGX Spark is a ONE environment-variable change, with zero code edits in the agents.

    WAITWISE_LLM=mock      # default — deterministic, instant, no server needed
    WAITWISE_LLM=nemotron  # vLLM/NIM serving Nemotron on the Spark (OpenAI-compatible)
    WAITWISE_LLM=ollama    # local llama3.2 via Ollama (dev fallback)

Each backend is just an OpenAI-compatible (base_url, model) pair, so the agents
only ever call `get_client()` / `MODEL` / `is_mock()`.
"""

import os
from functools import lru_cache

# ---- Backend registry -------------------------------------------------------
# Add a row here to support a new serving stack; nothing else changes.
_BACKENDS = {
    "mock": {
        "base_url": None,
        "model": "mock-deterministic",
        "label": "Mock (deterministic, no GPU)",
    },
    "nemotron": {
        # Any OpenAI-compatible server on the Spark: vLLM, NIM, or Ollama.
        # Override VLLM_BASE_URL/VLLM_MODEL to match whatever you serve.
        "base_url": os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1"),
        "model": os.getenv("VLLM_MODEL", "nvidia/Llama-3.1-Nemotron-70B-Instruct-HF"),
        "label": "NVIDIA Nemotron (DGX Spark, local)",
    },
    "ollama": {
        "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        "model": os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
        "label": "Ollama llama3.2 (local dev)",
    },
}


def _resolve_backend() -> str:
    """
    Pick the serving backend.

    Precedence:
      1. WAITWISE_LLM (mock|nemotron|ollama) — this module's explicit switch.
      2. The dgxsetup convention (MOCK_LLM + VLLM_*): MOCK_LLM=false means "use the
         vLLM/Nemotron server", so map it onto the `nemotron` backend. This keeps
         the colleague's DGX run scripts working without changes.
      3. Default: mock (always runs, no server needed).
    """
    explicit = os.getenv("WAITWISE_LLM")
    if explicit:
        return explicit.lower()
    mock_flag = os.getenv("MOCK_LLM")
    if mock_flag is not None:
        return "mock" if mock_flag.lower() == "true" else "nemotron"
    return "mock"


BACKEND = _resolve_backend()
if BACKEND not in _BACKENDS:
    raise ValueError(
        f"Resolved LLM backend {BACKEND!r} is not one of {list(_BACKENDS)} "
        f"(set WAITWISE_LLM, or MOCK_LLM=true/false)"
    )

_CFG = _BACKENDS[BACKEND]
MODEL = _CFG["model"]
LABEL = _CFG["label"]
BASE_URL = _CFG["base_url"]

# How many triage/comms requests to keep in flight at once. On vLLM this is what
# drives continuous batching (and the live GPU-utilisation spike); the mock just
# uses it to simulate concurrency. Tune from Friday's tokens/sec benchmark.
MAX_CONCURRENCY = int(os.getenv("WAITWISE_MAX_CONCURRENCY", "16"))

# Mock-only: per-assessment delay so a scan takes a few watchable seconds instead
# of flashing past in 0.5s — lets the live trace stream and the GPU curve spike on
# screen. Real backends ignore this (their latency is real). Tests set it to 0.
MOCK_DELAY_MS = int(os.getenv("WAITWISE_MOCK_DELAY_MS", "8"))


def is_mock() -> bool:
    return BACKEND == "mock"


def mock_pace():
    """Sleep the configured mock delay (no-op unless in mock mode)."""
    if BACKEND == "mock" and MOCK_DELAY_MS > 0:
        import time
        time.sleep(MOCK_DELAY_MS / 1000)


@lru_cache(maxsize=1)
def get_client():
    """Returns a cached OpenAI-compatible client, or None in mock mode."""
    if is_mock():
        return None
    from openai import OpenAI

    # api_key is required by the SDK; vLLM/NIM ignore the value.
    return OpenAI(base_url=BASE_URL, api_key=os.getenv("LLM_API_KEY", "EMPTY"))


def describe() -> dict:
    """Surface the active config (used by /gpu and the demo banner)."""
    return {"backend": BACKEND, "model": MODEL, "label": LABEL, "base_url": BASE_URL}
