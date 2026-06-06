import type { FlaggedCase, ResultsResponse, ScanEvent } from "./types"

/**
 * Development-only mocked data. Used as a manual fallback (e.g. via the
 * "Run demo" toggle in dev) so the UI can be exercised without a live backend.
 * The real API path remains the default in all cases.
 */

const now = () => new Date().toISOString()

export const MOCK_EVENTS: Omit<ScanEvent, "scan_run_id">[] = [
  { event_id: "e1", timestamp: now(), agent: "orchestrator", event_type: "scan_started", message: "Scan run initialised for coordinator." },
  { event_id: "e2", timestamp: now(), agent: "ingest", event_type: "data_loaded", message: "Loaded 4,212 patient records from waiting list." },
  { event_id: "e3", timestamp: now(), agent: "risk-model", event_type: "inference", patient_id: "PT-10293", message: "Scoring patient PT-10293 (cardiology, 62w wait)." },
  { event_id: "e4", timestamp: now(), agent: "risk-model", event_type: "flagged", patient_id: "PT-10293", message: "Flagged PT-10293 as HIGH risk (score 0.91)." },
  { event_id: "e5", timestamp: now(), agent: "risk-model", event_type: "inference", patient_id: "PT-20871", message: "Scoring patient PT-20871 (oncology, 48w wait)." },
  { event_id: "e6", timestamp: now(), agent: "risk-model", event_type: "flagged", patient_id: "PT-20871", message: "Flagged PT-20871 as HIGH risk (score 0.84)." },
  { event_id: "e7", timestamp: now(), agent: "triage", event_type: "triage_complete", patient_id: "PT-10293", message: "Triage recommendation generated for PT-10293." },
  { event_id: "e8", timestamp: now(), agent: "comms", event_type: "drafted", patient_id: "PT-10293", message: "Drafted coordinator memo + patient letter for PT-10293." },
  { event_id: "e9", timestamp: now(), agent: "risk-model", event_type: "flagged", patient_id: "PT-33410", message: "Flagged PT-33410 as MEDIUM risk (score 0.63)." },
  { event_id: "e10", timestamp: now(), agent: "orchestrator", event_type: "pipeline_complete", message: "Pipeline complete. 3 cases flagged for review." },
]

const MOCK_CASES: FlaggedCase[] = [
  {
    patient: { patient_id: "PT-10293", name: "Eleanor Whitfield", condition: "Aortic stenosis", borough: "Lambeth", wait_weeks: 62, imd_quintile: 1 },
    triage: {
      triage_id: "TR-10293",
      risk_level: "high",
      risk_score: 0.91,
      reason: "Severe symptomatic valve disease with wait time exceeding 52 weeks in a most-deprived quintile area; high deterioration risk.",
      recommended_action: "Expedite to next available cardiology slot within 2 weeks; flag for consultant review.",
    },
    communications: {
      memo: "Recommend immediate escalation of PT-10293 to cardiology. Wait of 62 weeks materially exceeds clinical threshold for symptomatic aortic stenosis.",
      patient_letter: "Dear Ms Whitfield, we are writing to let you know your case has been prioritised for an earlier cardiology appointment. Our team will contact you within 5 working days...",
    },
  },
  {
    patient: { patient_id: "PT-20871", name: "Marcus Dale", condition: "Suspected colorectal cancer", borough: "Newham", wait_weeks: 48, imd_quintile: 1 },
    triage: {
      triage_id: "TR-20871",
      risk_level: "high",
      risk_score: 0.84,
      reason: "Two-week-wait cancer pathway breached; diagnostic delay increases staging risk.",
      recommended_action: "Book urgent colonoscopy; assign cancer nurse specialist.",
    },
    communications: {
      memo: "PT-20871 has breached the 2WW cancer pathway. Recommend urgent diagnostic booking and CNS allocation.",
      patient_letter: "Dear Mr Dale, we want to ensure your diagnostic tests happen as soon as possible. A specialist nurse will call you to arrange an urgent appointment...",
    },
  },
  {
    patient: { patient_id: "PT-33410", name: "Priya Anand", condition: "Chronic knee osteoarthritis", borough: "Croydon", wait_weeks: 31, imd_quintile: 3 },
    triage: {
      triage_id: "TR-33410",
      risk_level: "medium",
      risk_score: 0.63,
      reason: "Moderate functional decline reported; mobility limiting but not immediately life-threatening.",
      recommended_action: "Offer interim physiotherapy and pain clinic referral while awaiting orthopaedic slot.",
    },
    communications: {
      memo: "Recommend interim physiotherapy for PT-33410 to manage symptoms during the orthopaedic wait.",
      patient_letter: "Dear Ms Anand, while you wait for your orthopaedic appointment, we'd like to offer you physiotherapy support to help manage your symptoms...",
    },
  },
]

export function buildMockResults(scanRunId: string): ResultsResponse {
  return {
    scan_run: {
      scan_run_id: scanRunId,
      coordinator_id: "CO001",
      status: "complete",
      started_at: now(),
      completed_at: now(),
    },
    flagged_cases: MOCK_CASES,
  }
}
