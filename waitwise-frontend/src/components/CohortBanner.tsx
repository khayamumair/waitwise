import { Activity, AlertTriangle, Cpu, Database } from "lucide-react"
import type { CohortSummary } from "../lib/types"

interface CohortBannerProps {
  summary: CohortSummary | null
}

const fmt = (n: number) => n.toLocaleString()

/**
 * The scale story in one row: the CPU rule engine sweeps the whole list, the
 * GPU is spent only on the slice that needs reasoning. This is the funnel that
 * turns "we called a model" into "we triaged an NHS-scale cohort locally".
 */
export function CohortBanner({ summary }: CohortBannerProps) {
  if (!summary) return null

  const stages = [
    {
      icon: Database,
      label: "Scanned (CPU SQL)",
      value: fmt(summary.total_scanned),
      tone: "text-muted-foreground",
      sub: "DuckDB rule engine",
    },
    {
      icon: AlertTriangle,
      label: "Coordination failures flagged",
      value: fmt(summary.n_flagged),
      tone: "text-warning",
      sub:
        summary.n_breach_18 != null
          ? `${fmt(summary.n_breach_18)} past the 18-wk RTT standard · ${fmt(summary.n_high)} high risk`
          : `${fmt(summary.n_high)} high · ${fmt(summary.n_medium)} medium · ${fmt(summary.n_low)} low`,
    },
    {
      icon: Cpu,
      label: "AI-triaged on Spark",
      value: fmt(summary.n_triaged),
      tone: "text-primary",
      sub: "highest-priority subset, full cohort queued",
    },
    {
      icon: Activity,
      label: "Confirmed high risk",
      value: fmt(summary.n_high),
      tone: "text-danger",
      sub: "coordinator-ready actions",
    },
  ]

  return (
    <section
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4"
      aria-label="Cohort scan summary"
    >
      {stages.map((s) => {
        const Icon = s.icon
        return (
          <div key={s.label} className="flex flex-col gap-1 bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 ${s.tone}`} aria-hidden />
              {s.label}
            </div>
            <div className={`font-mono text-2xl font-semibold ${s.tone}`}>{s.value}</div>
            <div className="text-[11px] text-muted-foreground/80">{s.sub}</div>
          </div>
        )
      })}
    </section>
  )
}
