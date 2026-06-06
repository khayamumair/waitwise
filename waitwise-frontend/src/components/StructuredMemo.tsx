import type { ReactNode } from "react"

/**
 * Render a structured memo (SUMMARY / KEY RISKS / RECOMMENDED ACTION) with
 * highlighted sections. The RECOMMENDED ACTION line is intentionally skipped:
 * every card already shows a dedicated "Recommended action" box, so rendering
 * it here too would duplicate it. (The copied memo text still includes it.)
 *
 * Falls back to plain text if the memo isn't in the expected structure, so the
 * box is never empty.
 */
export function StructuredMemo({ text }: { text: string }) {
  const clean = (text ?? "").trim()
  if (!clean) return null

  const nodes: ReactNode[] = []
  clean.split("\n").forEach((line, i) => {
    if (line.startsWith("RECOMMENDED ACTION:")) return
    if (line.startsWith("SUMMARY:")) {
      nodes.push(
        <p key={i}>
          <span className="font-semibold text-foreground">{line.slice(0, 8)}</span>
          <span className="text-foreground/85">{line.slice(8)}</span>
        </p>,
      )
    } else if (line.startsWith("KEY RISKS:")) {
      nodes.push(<p key={i} className="font-semibold text-foreground">{line}</p>)
    } else if (line.startsWith("- ")) {
      nodes.push(
        <p key={i} className="flex items-start gap-1.5 pl-1 text-foreground/80">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          {line.slice(2)}
        </p>,
      )
    } else if (line.trim()) {
      nodes.push(<p key={i} className="text-foreground/80">{line}</p>)
    }
  })

  // If nothing structured rendered (e.g. memo was only a RECOMMENDED ACTION line,
  // or free-form prose), show the full text rather than an empty box.
  if (nodes.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{clean}</p>
    )
  }

  return <div className="flex flex-col gap-1.5 text-[13px] leading-relaxed">{nodes}</div>
}
