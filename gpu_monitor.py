"""
gpu_monitor.py — GPU utilisation telemetry for the dashboard.

On the DGX Spark this reads real stats (pynvml, falling back to nvidia-smi).
Locally (mock mode) it synthesises an HONEST-shaped curve: idle at baseline,
spiking to near-saturation while a scan's triage/comms batch is in flight, then
decaying back. The point is that the live counter actually MOVES during a scan —
the same telemetry plumbing lights up for real once Nemotron serves on the Spark.

The pipeline calls mark_busy()/mark_idle() around the GPU-heavy stages.
"""

import math
import os
import random
import subprocess
import time

import llm_config

# Idle baseline + saturation target for the simulated curve.
_IDLE_UTIL = 6
_BUSY_UTIL = 92
_RAMP_SECONDS = 1.2  # how fast util climbs/decays


class GpuMonitor:
    def __init__(self):
        self._busy_since: float | None = None
        # Start well in the past so a freshly-booted server reads idle baseline,
        # not a phantom "just finished a scan" cooldown.
        self._idle_since: float = time.time() - 3600
        self._active_scans = 0
        self._pynvml = self._try_pynvml()

    @staticmethod
    def _try_pynvml():
        if llm_config.is_mock():
            return None  # no real GPU expected in mock mode
        try:
            import pynvml
            pynvml.nvmlInit()
            return pynvml
        except Exception:
            return None

    # --- called by the pipeline ------------------------------------------
    def mark_busy(self):
        self._active_scans += 1
        if self._busy_since is None:
            self._busy_since = time.time()

    def mark_idle(self):
        self._active_scans = max(0, self._active_scans - 1)
        if self._active_scans == 0:
            self._busy_since = None
            self._idle_since = time.time()

    @property
    def busy(self) -> bool:
        return self._active_scans > 0

    # --- telemetry --------------------------------------------------------
    def snapshot(self) -> dict:
        if self._pynvml is not None:
            real = self._real_snapshot()
            if real is not None:
                return real
        if not llm_config.is_mock():
            cli = self._nvidia_smi_snapshot()
            if cli is not None:
                return cli
        return self._simulated_snapshot()

    def _real_snapshot(self) -> dict | None:
        try:
            h = self._pynvml.nvmlDeviceGetHandleByIndex(0)
            util = self._pynvml.nvmlDeviceGetUtilizationRates(h).gpu
            mem = self._pynvml.nvmlDeviceGetMemoryInfo(h)
            name = self._pynvml.nvmlDeviceGetName(h)
            if isinstance(name, bytes):
                name = name.decode()
            return {
                "gpu_utilisation_pct": int(util),
                "vram_used_gb": round(mem.used / 1024**3, 1),
                "device": name,
                "model": llm_config.MODEL,
                "source": "pynvml",
            }
        except Exception:
            return None

    def _nvidia_smi_snapshot(self) -> dict | None:
        try:
            out = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,name",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=3,
            )
            util, mem_mb, name = out.stdout.strip().split(", ")
            return {
                "gpu_utilisation_pct": int(util),
                "vram_used_gb": round(int(mem_mb) / 1024, 1),
                "device": name,
                "model": llm_config.MODEL,
                "source": "nvidia-smi",
            }
        except Exception:
            return None

    def _simulated_snapshot(self) -> dict:
        now = time.time()
        if self.busy and self._busy_since is not None:
            t = now - self._busy_since
            ramp = 1 - math.exp(-t / _RAMP_SECONDS)
            util = _IDLE_UTIL + (_BUSY_UTIL - _IDLE_UTIL) * ramp
            util += random.uniform(-3, 4)
        else:
            t = now - self._idle_since
            decay = math.exp(-t / _RAMP_SECONDS)
            util = _IDLE_UTIL + (_BUSY_UTIL - _IDLE_UTIL) * decay * 0.4
            util += random.uniform(-1, 2)

        util = max(0, min(99, util))
        # ~8.4 GB resident model; small dynamic KV-cache wobble while busy.
        vram = 8.4 + (random.uniform(0.2, 1.6) if self.busy else 0.0)
        toks = int(util / 100 * 2600) if self.busy else 0  # rough tokens/sec proxy

        return {
            "gpu_utilisation_pct": round(util),
            "vram_used_gb": round(vram, 1),
            "device": "DGX Spark GB10 (simulated)",
            "model": llm_config.MODEL,
            "tokens_per_sec": toks,
            "source": "simulated",
        }


# Module-level singleton shared by the API and the pipeline.
MONITOR = GpuMonitor()
