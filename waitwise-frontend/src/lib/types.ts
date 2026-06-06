// TypeScript types for the WaitWise FastAPI backend contract.

export type RiskLevel = "high" | "medium" | "low" | string

/** A single streamed event from GET /stream/{scan_run_id} (SSE). */
export interface ScanEvent {
  event_id: string
  scan_run_id: string
  timestamp: string
  agent: string
  event_type: string
  patient_id?: string | null
  message: string
}

/** POST /scan response */
export interface ScanResponse {
  scan_run_id: string
}

export interface Patient {
  patient_id: string
  name: string
  condition: string
  borough: string
  wait_weeks: number
  imd_quintile: number
  ever_contacted?: boolean
  breach_52?: boolean
  breach_18?: boolean
}

export interface Triage {
  triage_id: string
  risk_level: RiskLevel
  risk_score: number
  reason: string
  recommended_action: string
}

export interface Communications {
  /** Backend field name. */
  coordinator_memo?: string
  /** Dev-mock field name (kept for the runDemo fallback). */
  memo?: string
  patient_letter?: string
  status?: string
  [key: string]: unknown
}

export interface FlaggedCase {
  patient: Patient
  triage: Triage
  communications: Communications
}

export interface ScanRun {
  scan_run_id: string
  coordinator_id?: string
  status?: string
  started_at?: string
  completed_at?: string
  [key: string]: unknown
}

/** Cohort-scale counts surfaced by the Monitor agent. */
export interface CohortSummary {
  total_scanned: number
  n_flagged: number
  n_high: number
  n_medium: number
  n_low: number
  n_breach_52?: number
  n_breach_18?: number
  n_triaged: number
}

/** One lightweight row in the full flagged-cohort queue. */
export interface CohortQueueRow {
  patient_id: string
  risk_band: string
  flag_count: number
  wait_weeks: number
  monitor_score: number
  tier: number
}

/** GET /results/{scan_run_id} response */
export interface ResultsResponse {
  scan_run: ScanRun
  cohort_summary?: CohortSummary
  cohort_queue?: CohortQueueRow[]
  flagged_cases: FlaggedCase[]
}

/** POST /approve/{triage_id} response */
export interface ApproveResponse {
  approved: boolean
  triage_id: string
  timestamp: string
}

/** One cohort-level finding from GET /insights. */
export interface Insight {
  id: string
  severity: "critical" | "high" | "insight" | string
  title: string
  stat: string
  unit: string
  headline: string
  detail: string
  action: string
  series?: { quintile: number; dna_patients: number }[]
}

/** GET /insights response */
export interface InsightsResponse {
  insights: Insight[]
}

/** One row in the action audit trail (GET /audit). */
export interface AuditEvent {
  id: string
  timestamp: string
  actor: string
  action: string
  patient_id?: string | null
  triage_id?: string | null
  detail?: string | null
}

/** GET /gpu response */
export interface GpuStatus {
  gpu_utilisation_pct: number
  vram_used_gb: number | null
  device: string
  tokens_per_sec?: number
  running_requests?: number | null
  waiting_requests?: number | null
  kv_cache_pct?: number
  model?: string
  busy?: boolean
  source?: string
  llm?: { backend: string; model: string; label: string; base_url: string | null }
}

export const COORDINATOR_IDS = ["CO001", "CO002", "CO003", "CO004", "CO005"] as const
export type CoordinatorId = (typeof COORDINATOR_IDS)[number]
