import { CONTEXT_LABELS } from "../../shared/constants";
import type { ContextSummary as ContextSummaryRow } from "../../shared/summary";

// "faster" reads as progress (accent), "slower" as regression (err); "flat" and
// the low-sample "not enough data yet" note both stay muted so the section is a
// quiet supplement rather than a scoreboard.
function trendClass(row: ContextSummaryRow): string {
  if (row.deltaPct === null || row.label === "flat") return "text-ink-muted";
  return row.deltaPct > 0 ? "text-accent" : "text-err";
}

export function ContextSummary({ summaries }: { summaries: ContextSummaryRow[] }) {
  if (summaries.length === 0) return null;

  return (
    <div className="mb-8 rounded-lg border border-ink-border bg-ink-surface p-4">
      <h3 className="mb-3 text-sm text-ink-muted">per-context trends</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="pb-2 font-normal">context</th>
            <th className="pb-2 text-right font-normal">raw wpm</th>
            <th className="pb-2 text-right font-normal">accuracy</th>
            <th className="pb-2 text-right font-normal">sessions</th>
            <th className="pb-2 text-right font-normal">last 30d</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((row) => (
            <tr key={row.context} className="border-t border-ink-border">
              <td className="py-1.5 text-ink-text">{CONTEXT_LABELS[row.context]}</td>
              <td className="py-1.5 text-right text-ink-bright">{Math.round(row.meanWpm)}</td>
              <td className="py-1.5 text-right text-ink-bright">
                {(row.meanAccuracy * 100).toFixed(1)}%
              </td>
              <td className="py-1.5 text-right text-ink-muted">{row.sessions}</td>
              <td className={`py-1.5 text-right ${trendClass(row)}`}>{row.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
