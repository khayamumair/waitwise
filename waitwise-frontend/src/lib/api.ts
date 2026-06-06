import type { ApproveResponse, AuditEvent, GpuStatus, InsightsResponse, ResultsResponse, ScanResponse } from "./types"

/**
 * Base URL of the FastAPI backend. Configure via VITE_API_BASE_URL.
 * Falls back to localhost:8080 in development (the backend's default port).
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = (body?.detail as string) ?? detail
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status)
  }
  return (await res.json()) as T
}

/** POST /scan - kick off a new scan run for a coordinator. */
export function startScan(coordinatorId: string): Promise<ScanResponse> {
  return request<ScanResponse>("/scan", {
    method: "POST",
    body: JSON.stringify({ coordinator_id: coordinatorId }),
  })
}

/** GET /results/{scan_run_id} - flagged cases once a scan completes. */
export function getResults(scanRunId: string): Promise<ResultsResponse> {
  return request<ResultsResponse>(`/results/${encodeURIComponent(scanRunId)}`)
}

/** POST /approve/{triage_id} - coordinator signs off on a triage. */
export function approveTriage(triageId: string, coordinatorId: string): Promise<ApproveResponse> {
  return request<ApproveResponse>(`/approve/${encodeURIComponent(triageId)}`, {
    method: "POST",
    body: JSON.stringify({ coordinator_id: coordinatorId }),
  })
}

/** GET /gpu - current GPU utilisation snapshot. */
export function getGpuStatus(): Promise<GpuStatus> {
  return request<GpuStatus>("/gpu")
}

/** GET /insights - cohort-level non-obvious findings. */
export function getInsights(): Promise<InsightsResponse> {
  return request<InsightsResponse>("/insights")
}

/** POST /audit - log a coordinator / GP action. Fire-and-forget (never blocks the UI). */
export function postAudit(entry: {
  actor: string
  action: string
  patient_id?: string
  triage_id?: string
  detail?: string
}): void {
  void request("/audit", { method: "POST", body: JSON.stringify(entry) }).catch(() => undefined)
}

/** GET /audit - full action history (newest first). */
export function getAudit(): Promise<{ events: AuditEvent[] }> {
  return request<{ events: AuditEvent[] }>("/audit")
}

/** Build the SSE stream URL for a scan run. */
export function streamUrl(scanRunId: string): string {
  return `${API_BASE_URL}/stream/${encodeURIComponent(scanRunId)}`
}

export { ApiError }
