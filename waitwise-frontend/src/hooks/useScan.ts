import { useCallback, useEffect, useRef, useState } from "react"
import { approveTriage, getResults, postAudit, startScan, streamUrl } from "../lib/api"
import type { CohortSummary, FlaggedCase, ScanEvent } from "../lib/types"
import type { ScanStatus } from "../components/ControlPanel"
import { MOCK_EVENTS, buildMockResults } from "../lib/mockData"

interface UseScanResult {
  status: ScanStatus
  scanRunId: string | null
  events: ScanEvent[]
  cases: FlaggedCase[]
  cohortSummary: CohortSummary | null
  resultsLoading: boolean
  hasResults: boolean
  errorMessage: string | null
  approvedIds: Set<string>
  approvingId: string | null
  start: (coordinatorId: string) => Promise<void>
  approve: (triageId: string, coordinatorId: string) => Promise<void>
  /** Dev-only: replay mocked events + results without a live backend. */
  runDemo: () => void
  reset: () => void
}

export function useScan(): UseScanResult {
  const [status, setStatus] = useState<ScanStatus>("idle")
  const [scanRunId, setScanRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<ScanEvent[]>([])
  const [cases, setCases] = useState<FlaggedCase[]>([])
  const [cohortSummary, setCohortSummary] = useState<CohortSummary | null>(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [hasResults, setHasResults] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const sourceRef = useRef<EventSource | null>(null)

  const closeStream = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
  }, [])

  useEffect(() => () => closeStream(), [closeStream])

  const loadResults = useCallback(async (runId: string) => {
    setResultsLoading(true)
    try {
      const data = await getResults(runId)
      setCases(data.flagged_cases ?? [])
      setCohortSummary(data.cohort_summary ?? null)
      setHasResults(true)
      setStatus("complete")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load results")
      setStatus("error")
    } finally {
      setResultsLoading(false)
    }
  }, [])

  const start = useCallback(
    async (coordinatorId: string) => {
      closeStream()
      setEvents([])
      setCases([])
      setCohortSummary(null)
      setHasResults(false)
      setApprovedIds(new Set())
      setErrorMessage(null)
      setStatus("scanning")

      let runId: string
      try {
        const res = await startScan(coordinatorId)
        runId = res.scan_run_id
        setScanRunId(runId)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to start scan")
        setStatus("error")
        return
      }

      // Open SSE stream immediately.
      const es = new EventSource(streamUrl(runId))
      sourceRef.current = es

      const handleEvent = (raw: string) => {
        try {
          const ev = JSON.parse(raw) as ScanEvent
          setEvents((prev) => [...prev, ev])
          if (ev.event_type === "pipeline_complete") {
            closeStream()
            void loadResults(runId)
          }
        } catch {
          /* ignore malformed event */
        }
      }

      es.onmessage = (e) => handleEvent(e.data)
      es.onerror = () => {
        // If the stream drops while scanning, surface an error unless we already completed.
        closeStream()
        setStatus((s) => {
          if (s === "scanning") {
            setErrorMessage("Live stream disconnected before the scan completed.")
            return "error"
          }
          return s
        })
      }
    },
    [closeStream, loadResults],
  )

  const approve = useCallback(
    async (triageId: string, coordinatorId: string) => {
      setApprovingId(triageId)
      const markApproved = () =>
        setApprovedIds((prev) => {
          const next = new Set(prev)
          next.add(triageId)
          return next
        })
      // Demo runs have no backend - approve locally.
      if (scanRunId?.startsWith("demo-")) {
        window.setTimeout(() => {
          markApproved()
          setApprovingId(null)
        }, 500)
        return
      }
      try {
        await approveTriage(triageId, coordinatorId)
        markApproved()
        postAudit({ actor: coordinatorId, action: "approve", triage_id: triageId,
          detail: "Coordinator approved the triage and communications." })
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to approve triage")
      } finally {
        setApprovingId(null)
      }
    },
    [scanRunId],
  )

  /**
   * Dev-only fallback: replays mocked events on a timer, then shows mocked
   * results. Lets the team exercise the full UI without a running backend.
   */
  const runDemo = useCallback(() => {
    closeStream()
    const runId = `demo-${Date.now().toString(36)}`
    setEvents([])
    setCases([])
    setHasResults(false)
    setApprovedIds(new Set())
    setErrorMessage(null)
    setScanRunId(runId)
    setStatus("scanning")

    MOCK_EVENTS.forEach((ev, i) => {
      window.setTimeout(() => {
        setEvents((prev) => [...prev, { ...ev, scan_run_id: runId, timestamp: new Date().toISOString() }])
        if (ev.event_type === "pipeline_complete") {
          setResultsLoading(true)
          window.setTimeout(() => {
            setCases(buildMockResults(runId).flagged_cases)
            setHasResults(true)
            setResultsLoading(false)
            setStatus("complete")
          }, 500)
        }
      }, i * 550)
    })
  }, [closeStream])

  const reset = useCallback(() => {
    closeStream()
    setStatus("idle")
    setScanRunId(null)
    setEvents([])
    setCases([])
    setCohortSummary(null)
    setHasResults(false)
    setResultsLoading(false)
    setErrorMessage(null)
    setApprovedIds(new Set())
    setApprovingId(null)
  }, [closeStream])

  return {
    status,
    scanRunId,
    events,
    cases,
    cohortSummary,
    resultsLoading,
    hasResults,
    errorMessage,
    approvedIds,
    approvingId,
    start,
    approve,
    runDemo,
    reset,
  }
}
