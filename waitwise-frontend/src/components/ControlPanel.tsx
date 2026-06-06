import { ChevronDown, FlaskConical, Loader2, Play, RotateCcw } from "lucide-react"
import { COORDINATOR_IDS } from "../lib/types"
import { cn } from "../lib/utils"

export type ScanStatus = "idle" | "scanning" | "complete" | "error"

interface ControlPanelProps {
  coordinatorId: string
  onCoordinatorChange: (id: string) => void
  onStartScan: () => void
  onReset: () => void
  /** Dev-only demo runner; when provided a button is shown in dev. */
  onRunDemo?: () => void
  status: ScanStatus
  scanRunId: string | null
  errorMessage: string | null
  eventCount: number
}

const STATUS_META: Record<ScanStatus, { label: string; dot: string; text: string }> = {
  idle: { label: "Ready", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  scanning: { label: "Scanning", dot: "bg-primary animate-pulse-dot", text: "text-primary" },
  complete: { label: "Complete", dot: "bg-success", text: "text-success" },
  error: { label: "Error", dot: "bg-danger", text: "text-danger" },
}

export function ControlPanel({
  coordinatorId,
  onCoordinatorChange,
  onStartScan,
  onReset,
  onRunDemo,
  status,
  scanRunId,
  errorMessage,
  eventCount,
}: ControlPanelProps) {
  const meta = STATUS_META[status]
  const scanning = status === "scanning"

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {/* Coordinator selector */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="coordinator" className="text-xs font-medium text-muted-foreground">
              Coordinator
            </label>
            <div className="relative">
              <select
                id="coordinator"
                value={coordinatorId}
                onChange={(e) => onCoordinatorChange(e.target.value)}
                disabled={scanning}
                className="w-44 appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-9 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                {COORDINATOR_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Start scan */}
          <button
            type="button"
            onClick={onStartScan}
            disabled={scanning}
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Start scan
              </>
            )}
          </button>

          {(status === "complete" || status === "error") && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          )}

          {onRunDemo && status !== "scanning" && (
            <button
              type="button"
              onClick={onRunDemo}
              title="Replay mocked data without a backend"
              className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <FlaskConical className="h-4 w-4" /> Run demo
            </button>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-col items-start gap-1 lg:items-end">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
            <span className={cn("text-sm font-semibold", meta.text)}>{meta.label}</span>
            {scanning && (
              <span className="font-mono text-xs text-muted-foreground">{eventCount} events</span>
            )}
          </div>
          {scanRunId && (
            <span className="font-mono text-[11px] text-muted-foreground">
              run: {scanRunId}
            </span>
          )}
        </div>
      </div>

      {status === "error" && errorMessage && (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessage}
        </p>
      )}
    </section>
  )
}
