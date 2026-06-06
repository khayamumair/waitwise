export type ClassValue = string | false | null | undefined

/** Tiny classnames joiner (avoids extra deps). */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ")
}

/** Format an ISO timestamp as HH:MM:SS for the trace log. */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString("en-GB", { hour12: false })
}

const RISK_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 }

/** Normalise a risk level to a comparable rank. */
export function riskRank(level: string): number {
  return RISK_ORDER[level?.toLowerCase()] ?? 0
}
