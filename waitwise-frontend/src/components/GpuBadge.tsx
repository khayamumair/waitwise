import { Cpu, Loader2 } from "lucide-react"
import type { GpuStatus } from "../lib/types"
import { cn } from "../lib/utils"

interface GpuBadgeProps {
  status: GpuStatus | null
  loading: boolean
  error: boolean
}

export function GpuBadge({ status, loading, error }: GpuBadgeProps) {
  const util = status?.gpu_utilisation_pct ?? 0
  const barColor = util > 80 ? "bg-danger" : util > 50 ? "bg-warning" : "bg-success"
  // Real telemetry (DGX GPU or live vLLM scrape) vs the local simulated curve.
  const isLive = status?.source === "vllm-metrics" || status?.source === "pynvml" || status?.source === "nvidia-smi"

  return (
    <div
      className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm"
      role="status"
      aria-label="GPU utilisation status"
    >
      <Cpu className="h-4 w-4 text-primary" aria-hidden />
      <div className="flex flex-col">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {error ? "GPU offline" : status?.device ?? "GPU"}
          {!error && isLive && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-success/15 px-1 text-[8px] font-bold text-success">
              <span className="h-1 w-1 animate-pulse-dot rounded-full bg-success" /> LIVE
            </span>
          )}
        </span>
        {error ? (
          <span className="text-xs font-semibold text-danger">unavailable</span>
        ) : !status && loading ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> connecting
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-foreground">{util.toFixed(0)}%</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColor)}
                style={{ width: `${Math.min(100, Math.max(2, util))}%` }}
              />
            </div>
            {status?.vram_used_gb != null && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {status.vram_used_gb.toFixed(1)} GB
              </span>
            )}
            {status?.tokens_per_sec ? (
              <span className="font-mono text-[11px] text-primary">
                {status.tokens_per_sec.toLocaleString()} tok/s
              </span>
            ) : null}
            {status?.running_requests ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {status.running_requests} req
              </span>
            ) : null}
            {status?.llm?.label ? (
              <span className="hidden truncate text-[10px] text-muted-foreground/70 sm:inline">
                · {status.llm.label}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
