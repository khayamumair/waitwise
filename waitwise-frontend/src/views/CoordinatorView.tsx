import { ControlPanel } from "../components/ControlPanel"
import { CohortBanner } from "../components/CohortBanner"
import { LiveTrace } from "../components/LiveTrace"
import { ResultsList } from "../components/ResultsList"
import type { useScan } from "../hooks/useScan"
import { useEscalation } from "../context/EscalationContext"

interface CoordinatorViewProps {
  coordinatorId: string
  onCoordinatorChange: (id: string) => void
  scan: ReturnType<typeof useScan>
}

export function CoordinatorView({ coordinatorId, onCoordinatorChange, scan }: CoordinatorViewProps) {
  const { escalate, isEscalated, getReferral } = useEscalation()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Coordinator workspace</h2>
        <p className="text-sm text-muted-foreground">
          Run a scan to surface the patients falling through coordination gaps, review each AI-drafted
          assessment, and escalate the urgent ones to a GP.
        </p>
      </div>

      <ControlPanel
        coordinatorId={coordinatorId}
        onCoordinatorChange={onCoordinatorChange}
        onStartScan={() => void scan.start(coordinatorId)}
        onReset={scan.reset}
        onRunDemo={import.meta.env.DEV ? scan.runDemo : undefined}
        status={scan.status}
        scanRunId={scan.scanRunId}
        errorMessage={scan.errorMessage}
        eventCount={scan.events.length}
      />

      <CohortBanner summary={scan.cohortSummary} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <LiveTrace events={scan.events} streaming={scan.status === "scanning"} />
        <ResultsList
          cases={scan.cases}
          loading={scan.resultsLoading}
          hasRun={scan.hasResults}
          approvedIds={scan.approvedIds}
          approvingId={scan.approvingId}
          onApprove={(triageId) => void scan.approve(triageId, coordinatorId)}
          onEscalate={(c) => escalate(c, coordinatorId)}
          isEscalated={isEscalated}
          getReferral={getReferral}
        />
      </div>
    </div>
  )
}
