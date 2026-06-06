import { useState } from "react"
import { Stethoscope, Inbox, Clock, MapPin, CheckCircle2, FileText, ArrowRight, MessageSquare } from "lucide-react"
import { useEscalation, type EscalatedReferral } from "../context/EscalationContext"
import type { View } from "../components/AppShell"
import { RiskBadge } from "../components/RiskBadge"
import { CopyButton } from "../components/CopyButton"
import { StructuredMemo } from "../components/StructuredMemo"
import { cn } from "../lib/utils"

const STATUS_META: Record<EscalatedReferral["status"], { label: string; cls: string }> = {
  awaiting_gp: { label: "Awaiting GP", cls: "bg-warning/15 text-warning" },
  accepted: { label: "Accepted", cls: "bg-accent text-accent-foreground" },
  actioned: { label: "Actioned", cls: "bg-success/15 text-success" },
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function ReferralRow({ r }: { r: EscalatedReferral }) {
  const { setStatus, setGpNote } = useEscalation()
  const { patient, triage, communications } = r.case_
  const memo = communications.coordinator_memo ?? communications.memo
  const st = STATUS_META[r.status]
  const [note, setNote] = useState(r.gpNote ?? "")

  return (
    <article className="card-elevated rounded-lg border border-border border-l-4 border-l-primary bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{patient.name}</h3>
            <RiskBadge level={triage.risk_level} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{patient.patient_id}</span>
            <span aria-hidden>&middot;</span>
            <span>{patient.condition}</span>
            <span aria-hidden>&middot;</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {patient.borough}</span>
            <span aria-hidden>&middot;</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {patient.wait_weeks}w wait</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
          <span className="text-[11px] text-muted-foreground">
            from {r.fromCoordinator} · {timeAgo(r.escalatedAt)}
          </span>
        </div>
      </div>

      {/* Referral memo */}
      {memo && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
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

      {/* Recommended action */}
      <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
        <span className="font-semibold text-primary">Recommended: </span>
        <span className="text-foreground">{triage.recommended_action}</span>
      </div>

      {/* Note back to coordinator */}
      <div className="mt-3">
        <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <MessageSquare className="h-3 w-3" /> Note to coordinator
        </label>
        <div className="mt-1 flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Accepted onto urgent cardiology list, booking team to call within 48h."
            className="min-h-[40px] flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setGpNote(triage.triage_id, note.trim())}
            disabled={!note.trim() || note.trim() === (r.gpNote ?? "")}
            className="self-start rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-primary transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {r.gpNote ? "Update" : "Send"}
          </button>
        </div>
        {r.gpNote && (
          <p className="mt-1 text-[11px] text-success">Note sent to coordinator.</p>
        )}
      </div>

      {/* GP actions */}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        {r.status === "awaiting_gp" && (
          <button
            type="button"
            onClick={() => setStatus(triage.triage_id, "accepted")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Accept referral <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {r.status === "accepted" && (
          <button
            type="button"
            onClick={() => setStatus(triage.triage_id, "actioned")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white transition hover:bg-success/90"
          >
            <CheckCircle2 className="h-4 w-4" /> Mark actioned (booked / contacted)
          </button>
        )}
        {r.status === "actioned" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> Patient actioned
          </span>
        )}
      </div>
    </article>
  )
}

export function GPView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { referrals } = useEscalation()
  const awaiting = referrals.filter((r) => r.status === "awaiting_gp").length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Stethoscope className="h-5 w-5 text-primary" /> GP triage queue
          </h2>
          <p className="text-sm text-muted-foreground">
            Referrals escalated by coordinators, prioritised by clinical risk. Accept and action the
            patients who need a clinician now.
          </p>
        </div>
        {referrals.length > 0 && (
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
            {awaiting} awaiting · {referrals.length} total
          </span>
        )}
      </div>

      {referrals.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40" aria-hidden />
          <p className="text-sm font-medium text-foreground">No referrals yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            When a coordinator escalates a flagged patient, the referral appears here with its memo and
            full risk picture.
          </p>
          <button
            type="button"
            onClick={() => onNavigate("coordinator")}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-accent"
          >
            Go to coordinator workspace <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {referrals.map((r) => (
            <ReferralRow key={r.case_.triage.triage_id} r={r} />
          ))}
        </div>
      )}
    </div>
  )
}
