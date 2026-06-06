import { useEffect, useState } from "react"
import { Lightbulb, ArrowRight } from "lucide-react"
import { getInsights } from "../lib/api"
import type { Insight } from "../lib/types"
import { cn } from "../lib/utils"

const SEVERITY: Record<string, { strip: string; chip: string; label: string }> = {
  critical: { strip: "bg-danger", chip: "bg-danger/10 text-danger", label: "Critical" },
  high: { strip: "bg-warning", chip: "bg-warning/10 text-warning", label: "High priority" },
  insight: { strip: "bg-primary", chip: "bg-accent text-accent-foreground", label: "Insight" },
}

function MiniGradient({ series }: { series: NonNullable<Insight["series"]> }) {
  const max = Math.max(...series.map((s) => s.dna_patients), 1)
  return (
    <div className="mt-3 flex items-end gap-1.5" aria-hidden>
      {series.map((s) => (
        <div key={s.quintile} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={cn("w-full rounded-t", s.quintile <= 2 ? "bg-danger/70" : "bg-primary/40")}
            style={{ height: `${Math.max(6, (s.dna_patients / max) * 44)}px` }}
            title={`IMD Q${s.quintile}: ${s.dna_patients}`}
          />
          <span className="text-[9px] text-muted-foreground">Q{s.quintile}</span>
        </div>
      ))}
    </div>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const sev = SEVERITY[insight.severity] ?? SEVERITY.insight
  return (
    <article className="card-elevated flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className={cn("h-1 w-full", sev.strip)} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", sev.chip)}>
            {sev.label}
          </span>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-extrabold tracking-tight text-foreground">{insight.stat}</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{insight.unit}</span>
        </div>

        <h3 className="mt-2 text-sm font-bold text-foreground">{insight.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">{insight.headline}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>

        {insight.series && <MiniGradient series={insight.series} />}

        <p className="mt-auto flex items-start gap-1.5 border-t border-border pt-3 text-xs font-semibold text-primary">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {insight.action}
        </p>
      </div>
    </article>
  )
}

export function InsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getInsights()
      .then((d) => active && setInsights(d.insights ?? []))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [])

  if (error || insights.length === 0) return null

  return (
    <section className="flex flex-col gap-3" aria-label="Cohort insights">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border pb-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Lightbulb className="h-4 w-4 text-primary" aria-hidden /> Cohort insights
        </h2>
        <span className="text-xs text-muted-foreground">Why the list is failing, across all 10,003 patients</span>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>
    </section>
  )
}
