import type { ReactNode } from "react"
import { ShieldCheck, LayoutDashboard, Stethoscope, Home, History } from "lucide-react"
import type { GpuStatus } from "../lib/types"
import { GpuBadge } from "./GpuBadge"
import { cn } from "../lib/utils"

export type View = "home" | "coordinator" | "gp" | "activity"

interface AppShellProps {
  gpu: GpuStatus | null
  gpuLoading: boolean
  gpuError: boolean
  view: View
  onNavigate: (v: View) => void
  gpQueueCount?: number
  children: ReactNode
}

const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Overview", icon: Home },
  { id: "coordinator", label: "Coordinator", icon: LayoutDashboard },
  { id: "gp", label: "GP triage", icon: Stethoscope },
  { id: "activity", label: "Audit trail", icon: History },
]

export function AppShell({ gpu, gpuLoading, gpuError, view, onNavigate, gpQueueCount = 0, children }: AppShellProps) {
  return (
    <div className="relative min-h-screen">
      {/* NHS blue masthead */}
      <header className="sticky top-0 z-20 bg-primary text-white shadow-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="flex items-center gap-3 text-left"
            aria-label="WaitWise home"
          >
            <span className="select-none rounded-[3px] bg-white px-2 py-0.5 text-xl font-extrabold italic tracking-tighter text-primary">
              NHS
            </span>
            <div className="flex flex-col leading-tight">
              <h1 className="text-base font-bold tracking-tight">WaitWise</h1>
              <p className="text-xs text-white/80">Waiting List Coordination &middot; RTT Triage</p>
            </div>
          </button>
          <GpuBadge status={gpu} loading={gpuLoading} error={gpuError} />
        </div>

        {/* Nav tabs */}
        <nav className="border-t border-white/15 bg-[hsl(220_100%_27%)]">
          <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-2 sm:px-5">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={view === id ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition",
                  view === id ? "text-white" : "text-white/70 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {id === "gp" && gpQueueCount > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                    {gpQueueCount}
                  </span>
                )}
                {view === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-white" />}
              </button>
            ))}
            <span className="ml-auto hidden items-center gap-1.5 py-2.5 text-[11px] text-white/70 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Local inference on NVIDIA DGX Spark - data never leaves this device
            </span>
          </div>
        </nav>
      </header>

      <div className="pointer-events-none absolute inset-x-0 top-[132px] h-60 bg-grid" aria-hidden />

      <main className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-[1400px] px-4 pb-8 pt-4 text-center text-xs text-muted-foreground sm:px-6">
        WaitWise &middot; agentic triage for NHS RTT waiting lists &middot; processed locally - DPA 2018 / Caldicott aligned
      </footer>
    </div>
  )
}
