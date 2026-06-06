import { ArrowRight, LayoutDashboard, Stethoscope, Activity, ShieldCheck, Cpu } from "lucide-react"
import { InsightsPanel } from "../components/InsightsPanel"
import type { View } from "../components/AppShell"

interface HomeViewProps {
  onNavigate: (v: View) => void
  gpQueueCount: number
}

/** National figures from the WaitWise patient-workflow reference (NHS England, ONS, King's Fund). */
const PROBLEM_STATS = [
  { value: "7.11M", label: "patients on the RTT waiting list", source: "NHS England, Mar 2026" },
  { value: "65.3%", label: "seen within 18 weeks - against a 92% standard", source: "last met in 2015" },
  { value: "2×", label: "more likely to wait a year if you're in the poorest areas", source: "King's Fund" },
]

export function HomeView({ onNavigate, gpQueueCount }: HomeViewProps) {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-[hsl(220_100%_27%)] px-6 py-10 text-white sm:px-10 sm:py-12">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/80">
          <Activity className="h-4 w-4" /> Agentic waiting-list coordination
        </div>
        <h1 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          No patient left waiting in the dark.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">
          WaitWise reads an entire NHS waiting list, finds the people slipping through coordination
          gaps - the long-waiters never contacted, the pathway changes never reassessed, the
          deprived patients going quietly silent - and turns each one into a reviewed, ready-to-action
          referral. Every decision is made locally on an NVIDIA DGX Spark; no patient data leaves the room.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate("coordinator")}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-primary transition hover:bg-white/90"
          >
            <LayoutDashboard className="h-4 w-4" /> Open coordinator workspace <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate("gp")}
            className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <Stethoscope className="h-4 w-4" /> GP triage queue
            {gpQueueCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-primary">
                {gpQueueCount}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* The problem */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">The problem</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PROBLEM_STATS.map((s) => (
            <div key={s.label} className="card-elevated rounded-xl border border-border bg-card p-5">
              <div className="font-mono text-3xl font-extrabold text-primary">{s.value}</div>
              <p className="mt-1 text-sm font-medium text-foreground">{s.label}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{s.source}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cohort insights */}
      <InsightsPanel />

      {/* How it works / entry cards */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Two workspaces, one handoff</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onNavigate("coordinator")}
            className="card-elevated group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary/40 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold text-foreground">Coordinator workspace</h3>
            <p className="text-sm text-muted-foreground">
              Scan the list, watch the agents reason in real time, review each AI-drafted assessment and
              referral memo, then approve or escalate the urgent cases to a GP.
            </p>
            <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Open workspace <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("gp")}
            className="card-elevated group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary/40 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
              <Stethoscope className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold text-foreground">GP triage queue</h3>
            <p className="text-sm text-muted-foreground">
              Escalated referrals land here with a structured memo and the full risk picture, so a
              clinician can accept and action the highest-priority patients in seconds.
            </p>
            <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View queue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </section>

      {/* Trust strip */}
      <section className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-5 py-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Cpu className="h-4 w-4 text-primary" /> NVIDIA Nemotron on DGX Spark</span>
        <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Zero data egress · DPA 2018 / Caldicott</span>
        <span className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-primary" /> Clinician-in-the-loop - recommendations, not automated decisions</span>
      </section>
    </div>
  )
}
