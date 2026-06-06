import { useState } from "react"
import { AppShell, type View } from "./components/AppShell"
import { HomeView } from "./views/HomeView"
import { CoordinatorView } from "./views/CoordinatorView"
import { GPView } from "./views/GPView"
import { ActivityView } from "./views/ActivityView"
import { useGpuStatus } from "./hooks/useGpuStatus"
import { useScan } from "./hooks/useScan"
import { EscalationProvider, useEscalation } from "./context/EscalationContext"
import { COORDINATOR_IDS } from "./lib/types"

function Shell() {
  const [view, setView] = useState<View>("home")
  const [coordinatorId, setCoordinatorId] = useState<string>(COORDINATOR_IDS[0])
  const gpu = useGpuStatus(1000)
  // Lifted here so scan results survive navigating between views.
  const scan = useScan()
  const { referrals } = useEscalation()
  const gpQueueCount = referrals.filter((r) => r.status !== "actioned").length

  return (
    <AppShell
      gpu={gpu.status}
      gpuLoading={gpu.loading}
      gpuError={gpu.error}
      view={view}
      onNavigate={setView}
      gpQueueCount={gpQueueCount}
    >
      {view === "home" && <HomeView onNavigate={setView} gpQueueCount={gpQueueCount} />}
      {view === "coordinator" && (
        <CoordinatorView coordinatorId={coordinatorId} onCoordinatorChange={setCoordinatorId} scan={scan} />
      )}
      {view === "gp" && <GPView onNavigate={setView} />}
      {view === "activity" && <ActivityView />}
    </AppShell>
  )
}

export default function App() {
  return (
    <EscalationProvider>
      <Shell />
    </EscalationProvider>
  )
}
