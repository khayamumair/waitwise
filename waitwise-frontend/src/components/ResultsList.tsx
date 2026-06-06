import { useMemo } from "react"
import { ClipboardList, Inbox, Loader2 } from "lucide-react"
import type { FlaggedCase } from "../lib/types"
import { riskRank } from "../lib/utils"
import { CaseCard } from "./CaseCard"

interface ResultsListProps {
  cases: FlaggedCase[]
  loading: boolean
  hasRun: boolean
  approvedIds: Set<string>
  approvingId: string | null
  onApprove: (triageId: string) => void
  onEscalate?: (case_: FlaggedCase) => void
  isEscalated?: (triageId: string) => boolean
  getReferral?: (triageId: string) => { status: "awaiting_gp" | "accepted" | "actioned"; gpNote?: string } | undefined
}

export function ResultsList({
  cases,
  loading,
  hasRun,
  approvedIds,
  approvingId,
  onApprove,
  onEscalate,
  isEscalated,
  getReferral,
}: ResultsListProps) {
  // Render only the top slice - a coordinator works the worst cases first, and
  // 300+ heavy cards would jank the browser. The full counts live in the banner.
  const MAX_CARDS = 50

  const sorted = useMemo(
    () =>
      [...cases].sort((a, b) => {
        const r = riskRank(b.triage.risk_level) - riskRank(a.triage.risk_level)
        if (r !== 0) return r
        return (b.triage.risk_score ?? 0) - (a.triage.risk_score ?? 0)
      }),
    [cases],
  )
  const visible = sorted.slice(0, MAX_CARDS)

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">Flagged cases</h2>
        </div>
        {sorted.length > 0 && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {approvedIds.size}/{sorted.length} approved
          </span>
        )}
      </header>

      {sorted.length > MAX_CARDS && (
        <p className="text-[11px] text-muted-foreground">
          Showing top {MAX_CARDS} of {sorted.length.toLocaleString()} triaged cases, highest risk first.
        </p>
      )}

      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm">Compiling flagged cases…</p>
        </div>
      ) : !hasRun ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/40" aria-hidden />
          <p className="text-sm text-muted-foreground">Results will appear here</p>
          <p className="max-w-xs text-xs text-muted-foreground/70">
            Once a scan completes, prioritised cases are listed by risk for your review and approval.
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-center">
          <Inbox className="h-8 w-8 text-success/50" aria-hidden />
          <p className="text-sm text-foreground">No cases flagged</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            The scan completed without identifying any cases that need escalation.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((c) => {
            const ref = getReferral?.(c.triage.triage_id)
            return (
              <CaseCard
                key={c.triage.triage_id}
                case_={c}
                approved={approvedIds.has(c.triage.triage_id)}
                approving={approvingId === c.triage.triage_id}
                onApprove={onApprove}
                onEscalate={onEscalate}
                escalated={isEscalated?.(c.triage.triage_id) ?? false}
                referralStatus={ref?.status}
                gpNote={ref?.gpNote}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
