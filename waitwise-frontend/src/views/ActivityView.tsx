import { useEffect, useState } from "react"
import { History, Check, Stethoscope, MessageSquare, Phone, ShieldCheck, RefreshCw } from "lucide-react"
import { getAudit } from "../lib/api"
import type { AuditEvent } from "../lib/types"
import { cn, formatTime } from "../lib/utils"

const ACTION_META: Record<string, { label: string; icon: typeof Check; tone: string }> = {
  approve: { label: "Approved", icon: Check, tone: "text-success" },
  escalate: { label: "Escalated to GP", icon: Stethoscope, tone: "text-primary" },
  gp_accept: { label: "GP accepted", icon: Check, tone: "text-primary" },
  gp_action: { label: "GP actioned", icon: ShieldCheck, tone: "text-success" },
  gp_note: { label: "GP note", icon: MessageSquare, tone: "text-accent-foreground" },
  voice_checkin: { label: "Voice check-in", icon: Phone, tone: "text-warning" },
}

export function ActivityView() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = () => {
    getAudit()
      .then((d) => { setEvents(d.events ?? []); setError(false) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const id = window.setInterval(load, 4000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <History className="h-5 w-5 text-primary" /> Audit trail
          </h2>
          <p className="text-sm text-muted-foreground">
            Every coordinator, GP and voice-agent action, in order. An immutable record for clinical
            governance and the closed-loop coordination story.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Could not reach the audit endpoint - is the backend running on :8080?
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 text-center">
          <History className="h-9 w-9 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No actions logged yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Approve or escalate a case, leave a GP note, or run the voice agent - everything lands here.
          </p>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {events.map((e, i) => {
            const meta = ACTION_META[e.action] ?? { label: e.action, icon: History, tone: "text-muted-foreground" }
            const Icon = meta.icon
            return (
              <li
                key={e.id}
                className={cn("flex items-start gap-3 px-4 py-3", i !== events.length - 1 && "border-b border-border")}
              >
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted", meta.tone)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className={cn("font-semibold", meta.tone)}>{meta.label}</span>
                    <span className="text-muted-foreground">by</span>
                    <span className="font-medium text-foreground">{e.actor}</span>
                    {e.patient_id && <span className="font-mono text-[11px] text-muted-foreground">· {e.patient_id}</span>}
                  </div>
                  {e.detail && <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/80">{e.detail}</p>}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatTime(e.timestamp)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
