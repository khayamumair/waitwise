import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { FlaggedCase } from "../lib/types"
import { postAudit } from "../lib/api"

/**
 * Shared coordinator <-> GP handoff. A coordinator escalates a flagged case; it
 * lands in the GP triage queue; the GP accepts, actions, and can leave a note
 * back for the coordinator. Every action is mirrored to the backend audit trail.
 */
export interface EscalatedReferral {
  case_: FlaggedCase
  escalatedAt: string
  fromCoordinator: string
  status: "awaiting_gp" | "accepted" | "actioned"
  gpNote?: string
}

interface EscalationCtx {
  referrals: EscalatedReferral[]
  escalate: (case_: FlaggedCase, fromCoordinator: string) => void
  setStatus: (triageId: string, status: EscalatedReferral["status"]) => void
  setGpNote: (triageId: string, note: string) => void
  isEscalated: (triageId: string) => boolean
  getReferral: (triageId: string) => EscalatedReferral | undefined
}

const Ctx = createContext<EscalationCtx | null>(null)

export function EscalationProvider({ children }: { children: ReactNode }) {
  const [referrals, setReferrals] = useState<EscalatedReferral[]>([])

  const escalate = useCallback((case_: FlaggedCase, fromCoordinator: string) => {
    setReferrals((prev) => {
      if (prev.some((r) => r.case_.triage.triage_id === case_.triage.triage_id)) return prev
      return [
        { case_, fromCoordinator, escalatedAt: new Date().toISOString(), status: "awaiting_gp" },
        ...prev,
      ]
    })
    postAudit({
      actor: fromCoordinator,
      action: "escalate",
      patient_id: case_.patient.patient_id,
      triage_id: case_.triage.triage_id,
      detail: `Escalated ${case_.patient.name} (${case_.triage.risk_level} risk) to the GP triage queue.`,
    })
  }, [])

  const setStatus = useCallback((triageId: string, status: EscalatedReferral["status"]) => {
    setReferrals((prev) =>
      prev.map((r) => (r.case_.triage.triage_id === triageId ? { ...r, status } : r)),
    )
    const ref = referrals.find((r) => r.case_.triage.triage_id === triageId)
    postAudit({
      actor: "GP",
      action: status === "accepted" ? "gp_accept" : "gp_action",
      patient_id: ref?.case_.patient.patient_id,
      triage_id: triageId,
      detail: status === "accepted" ? "GP accepted the referral." : "GP marked the patient actioned (booked / contacted).",
    })
  }, [referrals])

  const setGpNote = useCallback((triageId: string, note: string) => {
    setReferrals((prev) =>
      prev.map((r) => (r.case_.triage.triage_id === triageId ? { ...r, gpNote: note } : r)),
    )
    const ref = referrals.find((r) => r.case_.triage.triage_id === triageId)
    postAudit({
      actor: "GP",
      action: "gp_note",
      patient_id: ref?.case_.patient.patient_id,
      triage_id: triageId,
      detail: `Note to coordinator: ${note}`,
    })
  }, [referrals])

  const isEscalated = useCallback(
    (triageId: string) => referrals.some((r) => r.case_.triage.triage_id === triageId),
    [referrals],
  )

  const getReferral = useCallback(
    (triageId: string) => referrals.find((r) => r.case_.triage.triage_id === triageId),
    [referrals],
  )

  const value = useMemo(
    () => ({ referrals, escalate, setStatus, setGpNote, isEscalated, getReferral }),
    [referrals, escalate, setStatus, setGpNote, isEscalated, getReferral],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEscalation(): EscalationCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useEscalation must be used within EscalationProvider")
  return ctx
}
