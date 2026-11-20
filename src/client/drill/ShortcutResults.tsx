import { useEffect, useMemo, useRef, useState } from "react";
import type { ShortcutDrillSummary, ShortcutStats } from "../../shared/types";
import { chordLabel, summarizeAttempts } from "../../shared/chords";
import { api } from "../api";
import type { ShortcutDrillResult } from "./ShortcutDrill";

export function formatAccuracy(s: ShortcutStats): string {
  return s.attempts === 0 ? "—" : `${Math.round(s.accuracy * 100)}%`;
}

export function formatLatency(s: ShortcutStats): string {
  return s.meanCorrectLatencyMs === null ? "—" : `${Math.round(s.meanCorrectLatencyMs)} ms`;
}

/** One row per drilled chord, in DRILL_CHORDS order. Shared by the results screen and History. */
export function ShortcutTable({ summary }: { summary: ShortcutDrillSummary }) {
  return (
    <table className="w-full text-sm" data-testid="shortcut-table">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
          <th className="py-1 font-normal">shortcut</th>
          <th className="py-1 font-normal">correct</th>
          <th className="py-1 font-normal">accuracy</th>
          <th className="py-1 font-normal">mean correct latency</th>
        </tr>
      </thead>
      <tbody>
        {summary.perChord.map((c) => (
          <tr key={c.chord} data-chord={c.chord} className="border-t border-ink-border">
            <td className="py-1.5 font-mono text-ink-bright">{chordLabel(c.chord)}</td>
            <td className="py-1.5 text-ink-text">
              {c.correct}/{c.attempts}
            </td>
            <td className="py-1.5 text-ink-text">{formatAccuracy(c)}</td>
            <td className="py-1.5 text-ink-text">{formatLatency(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-4xl font-semibold text-ink-bright">{value}</span>
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
    </div>
  );
}

/**
 * Results of a finished shortcut drill. The summary is computed client-side, so
 * it renders even if the save fails; the save happens once per result.
 */
export function ShortcutResults({
  result,
  onAgain,
  onViewHistory,
}: {
  result: ShortcutDrillResult;
  onAgain: () => void;
  onViewHistory: () => void;
}) {
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saving");
  const savedRef = useRef(false);

  const summary = useMemo(
    () => summarizeAttempts(result.attempts.map((a) => ({ ...a, correct: a.actual === a.expected }))),
    [result],
  );

  useEffect(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    api
      .saveShortcutDrill({
        clientId: result.clientId,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        attempts: result.attempts,
      })
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }, [result]);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg text-ink-bright">Shortcut drill complete</h2>
      <p className="mb-6 text-xs text-ink-muted">
        {saveState === "saving" && "saving…"}
        {saveState === "saved" && "saved to history"}
        {saveState === "error" && <span className="text-err">save failed — is the server running?</span>}
      </p>

      <div className="mb-8 flex gap-10">
        <Stat label="accuracy" value={formatAccuracy(summary.overall)} />
        <Stat label="mean correct latency" value={formatLatency(summary.overall)} />
      </div>

      <div className="mb-8 rounded-lg border border-ink-border bg-ink-surface p-4">
        <h3 className="mb-3 text-sm text-ink-muted">per shortcut</h3>
        <ShortcutTable summary={summary} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onAgain}
          className="rounded bg-accent px-4 py-2 font-semibold text-ink-bg hover:opacity-90"
        >
          again
        </button>
        <button
          onClick={onViewHistory}
          className="rounded border border-ink-border px-4 py-2 text-ink-text hover:bg-ink-surface"
        >
          view history
        </button>
      </div>
    </div>
  );
}
