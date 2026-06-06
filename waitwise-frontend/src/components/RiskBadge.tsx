import { cn, riskRank } from "../lib/utils"

const STYLES: Record<string, string> = {
  high: "bg-danger/15 text-danger border-danger/30",
  medium: "bg-warning/15 text-warning border-warning/30",
  low: "bg-success/15 text-success border-success/30",
}

export function RiskBadge({ level, className }: { level: string; className?: string }) {
  const key = level?.toLowerCase()
  const style = STYLES[key] ?? "bg-muted text-muted-foreground border-border"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        style,
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          key === "high" ? "bg-danger" : key === "medium" ? "bg-warning" : key === "low" ? "bg-success" : "bg-muted-foreground",
        )}
      />
      {level} risk
    </span>
  )
}

export { riskRank }
