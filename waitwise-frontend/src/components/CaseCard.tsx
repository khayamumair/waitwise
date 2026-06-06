import { useState } from "react"
import {
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Clock,
  Gauge,
  Target,
  AlertTriangle,
  PhoneOff,
  TrendingDown,
  Stethoscope,
} from "lucide-react"
import type { FlaggedCase } from "../lib/types"
import { cn } from "../lib/utils"
import { RiskBadge } from "./RiskBadge"
import { CopyButton } from "./CopyButton"
import { StructuredMemo } from "./StructuredMemo"

interface CaseCardProps {
  case_: FlaggedCase
  approved: boolean
  approving: boolean
  onApprove: (triageId: string) => void
  onEscalate?: (case_: FlaggedCase) => void
  escalated?: boolean
  referralStatus?: "awaiting_gp" | "accepted" | "actioned"
  gpNote?: string
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-background/40 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}

function AlertChip({ icon, label, variant }: { icon: React.ReactNode; label: string; variant: "danger" | "warning" | "muted" }) {
  const styles = {
    danger: "bg-danger/10 text-danger border-danger/20",
    warning: "bg-warning/10 text-warning border-warning/25",
    muted: "bg-muted text-muted-foreground border-border",
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", styles[variant])}>
      {icon}
      {label}
    </span>
  )
}

const REFERRAL_STATUS_LABEL: Record<string, string> = {
  awaiting_gp: "Awaiting GP",
  accepted: "GP accepted",
  actioned: "GP actioned",
}

export function CaseCard({ case_, approved, approving, onApprove, onEscalate, escalated, referralStatus, gpNote }: CaseCardProps) {
  const { patient, triage, communications } = case_
  const [showComms, setShowComms] = useState(false)
  const scorePct = Math.round((triage.risk_score ?? 0) * 100)
  const level = triage.risk_level?.toLowerCase()
  const memo = communications.coordinator_memo ?? communications.memo
  const accent =
    level === "high" ? "border-l-danger" : level === "medium" ? "border-l-warning" : "border-l-success"

  // Derive alert chips from patient flags.
  const chips: React.ReactNode[] = []
  if (patient.wait_weeks > 52 || patient.breach_52)
    chips.push(<AlertChip key="52w" icon={<AlertTriangle className="h-3 w-3" />} label="52-wk RTT breach" variant="danger" />)
  else if (patient.wait_weeks >= 18 || patient.breach_18)
    chips.push(<AlertChip key="18w" icon={<AlertTriangle className="h-3 w-3" />} label="18-wk breach" variant="warning" />)
  if (patient.ever_contacted === false)
    chips.push(<AlertChip key="nc" icon={<PhoneOff className="h-3 w-3" />} label="Never contacted" variant="danger" />)
  if (patient.imd_quintile === 1)
    chips.push(<AlertChip key="imd" icon={<TrendingDown className="h-3 w-3" />} label="IMD Q1 - most deprived" variant="warning" />)

  return (
    <article
      className={cn(
        "card-elevated flex flex-col gap-4 rounded-lg border border-border border-l-4 bg-card p-4 transition hover:shadow-md sm:p-5",
        accent,
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold leading-tight text-foreground">{patient.name}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{patient.patient_id}</span>
            <span aria-hidden>&middot;</span>
            <span>{patient.condition}</span>
          </div>
        </div>
        <RiskBadge level={triage.risk_level} />
      </div>

      {/* Alert chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips}
        </div>
      )}

      {/* GP note back to the coordinator */}
      {gpNote && (
        <div className="rounded-md border-l-4 border-l-accent-foreground bg-accent px-3 py-2 text-[13px] text-accent-foreground">
          <span className="font-semibold">Note from GP:</span> {gpNote}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<MapPin className="h-3 w-3" />} label="Borough" value={patient.borough} />
        <Stat icon={<Clock className="h-3 w-3" />} label="Wait" value={`${patient.wait_weeks}w`} />
        <Stat icon={<Gauge className="h-3 w-3" />} label="IMD quintile" value={`Q${patient.imd_quintile}`} />
        <Stat icon={<Target className="h-3 w-3" />} label="Risk score" value={`${scorePct}%`} />
      </div>

      {/* Risk score bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            level === "high" ? "bg-danger" : level === "medium" ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${Math.min(100, Math.max(3, scorePct))}%` }}
        />
      </div>

      {/* Reasoning */}
      <div className="flex flex-col gap-2.5">
        <div className="rounded-md bg-background/50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Clinical assessment</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{triage.reason}</p>
        </div>
        <div className="rounded-md border-l-4 border-l-primary bg-accent px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Target className="h-3 w-3" /> Recommended action
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">{triage.recommended_action}</p>
        </div>
      </div>

      {/* Communications */}
      <div className="rounded-lg border border-border bg-background/40">
        <button
          type="button"
          onClick={() => setShowComms((s) => !s)}
          aria-expanded={showComms}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-foreground"
        >
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Communications preview
          </span>
          <span className="text-xs text-muted-foreground">{showComms ? "Hide" : "Show"}</span>
        </button>
        {showComms && (
          <div className="flex flex-col gap-4 border-t border-border px-3 py-3">
            {!memo && !communications.patient_letter && (
              <p className="text-center text-xs text-muted-foreground py-2">
                {level === "high"
                  ? "Communications not yet drafted - check scan completed."
                  : "Communications are only drafted for high-risk patients."}
              </p>
            )}
            {memo && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <FileText className="h-3 w-3" /> Referral memo
                  </p>
                  <CopyButton text={memo} />
                </div>
                <div className="rounded-md border border-border bg-background/60 px-3 py-2.5">
                  <StructuredMemo text={memo} />
                </div>
              </div>
            )}
            {communications.patient_letter && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Mail className="h-3 w-3" /> Patient letter
                  </p>
                  <CopyButton text={communications.patient_letter} />
                </div>
                <p className="whitespace-pre-wrap rounded-md border border-border bg-background/60 px-3 py-2.5 text-[13px] italic leading-relaxed text-foreground/85">
                  {communications.patient_letter}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="font-mono text-[11px] text-muted-foreground">{triage.triage_id}</span>
        <div className="flex items-center gap-2">
          {onEscalate && (
            escalated ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground">
                <Stethoscope className="h-4 w-4" /> {referralStatus ? REFERRAL_STATUS_LABEL[referralStatus] : "Sent to GP"}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onEscalate(case_)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-card px-3 py-2 text-sm font-semibold text-primary transition hover:bg-accent"
              >
                <Stethoscope className="h-4 w-4" /> Escalate to GP
              </button>
            )
          )}
          {approved ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-success/15 px-3 py-2 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> Approved
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onApprove(triage.triage_id)}
              disabled={approving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {approving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Approving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Approve
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
