import { useEffect, useRef } from "react"
import { Radio, Terminal } from "lucide-react"
import type { ScanEvent } from "../lib/types"
import { cn, formatTime } from "../lib/utils"

interface LiveTraceProps {
  events: ScanEvent[]
  streaming: boolean
}

const AGENT_COLORS: Record<string, string> = {
  orchestrator: "text-primary",
  ingest: "text-success",
  "risk-model": "text-warning",
  triage: "text-primary",
  comms: "text-success",
}

function eventAccent(eventType: string): string {
  if (eventType === "flagged") return "border-l-warning"
  if (eventType === "pipeline_complete") return "border-l-success"
  if (eventType.includes("error")) return "border-l-danger"
  return "border-l-border"
}

export function LiveTrace({ events, streaming }: LiveTraceProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Newest events render at the top, so keep the view pinned to the top.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 0
  }, [events.length])

  const ordered = [...events].reverse()

  return (
    <section className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Live agent trace</h2>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
            streaming ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Radio className={cn("h-3 w-3", streaming && "animate-pulse-dot")} />
          {streaming ? "Streaming" : "Idle"}
        </span>
      </header>

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto p-3">
        {events.length === 0 ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-center">
            <Terminal className="h-8 w-8 text-muted-foreground/40" aria-hidden />
            <p className="text-sm text-muted-foreground">No events yet</p>
            <p className="max-w-xs text-xs text-muted-foreground/70">
              Start a scan to watch the agent pipeline stream its reasoning in real time.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 font-mono text-xs">
            {ordered.map((ev) => (
              <li
                key={ev.event_id}
                className={cn(
                  "animate-slide-in rounded-md border-l-2 bg-background/40 px-3 py-2",
                  eventAccent(ev.event_type),
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground/70">{formatTime(ev.timestamp)}</span>
                  <span className={cn("font-semibold", AGENT_COLORS[ev.agent] ?? "text-foreground")}>
                    {ev.agent}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {ev.event_type}
                  </span>
                  {ev.patient_id && (
                    <span className="text-muted-foreground">#{ev.patient_id}</span>
                  )}
                </div>
                <p className="mt-1 font-sans text-[13px] leading-relaxed text-foreground/90">
                  {ev.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
