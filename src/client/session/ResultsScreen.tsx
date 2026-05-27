import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeMode, SessionKeyStat, SessionRow } from "../../shared/types";
import { type Context, CONTEXT_LABELS } from "../../shared/constants";
import { computeMetrics } from "../../shared/metrics";
import { api } from "../api";
import { HeatMap } from "../components/HeatMap";
import type { Keymap } from "../../server/keymap/types";
import type { SessionResult } from "./TypingSurface";

function aggregateKeyStats(result: SessionResult): SessionKeyStat[] {
  const acc = new Map<string, { sum: number; err: number; n: number }>();
  for (const k of result.keystrokes) {
    const a = acc.get(k.expectedChar) ?? { sum: 0, err: 0, n: 0 };
    a.sum += k.latencyMs;
    a.err += k.correct ? 0 : 1;
    a.n += 1;
    acc.set(k.expectedChar, a);
  }
  return [...acc.entries()].map(([key, a]) => ({
    key,
    meanLatencyMs: a.sum / a.n,
    errorRate: a.err / a.n,
    samples: a.n,
  }));
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-4xl font-semibold text-ink-bright">{value}</span>
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
    </div>
  );
}

export function ResultsScreen({
  result,
  mode,
  context,
  targetSeconds,
  targetChars,
  keymap,
  onAgain,
  onViewHistory,
}: {
  result: SessionResult;
  mode: PracticeMode;
  context: Context;
  targetSeconds: number;
  targetChars: number;
  keymap: Keymap | null;
  onAgain: () => void;
  onViewHistory: () => void;
}) {
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saving");
  const savedRef = useRef(false);

  const metrics = useMemo(
    () => computeMetrics(result.keystrokes, Math.max(result.endedAt - result.startedAt, 1)),
    [result],
  );
  const keyStats = useMemo(() => aggregateKeyStats(result), [result]);

  useEffect(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    api
      .saveSession({
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        mode,
        context,
        targetSeconds,
        targetChars,
        keystrokes: result.keystrokes,
      })
      .then((_row: SessionRow) => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }, [result, mode, context, targetSeconds, targetChars]);

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg text-ink-bright">Session complete</h2>
      <p className="mb-6 text-xs text-ink-muted">
        {mode === "targeted" ? "targeted at your weak spots" : `random ${CONTEXT_LABELS[context]}`} ·{" "}
        {saveState === "saving" && "saving…"}
        {saveState === "saved" && "saved to history"}
        {saveState === "error" && <span className="text-err">save failed — is the server running?</span>}
      </p>

      <div className="mb-8 flex gap-10">
        <Stat label="raw wpm" value={String(Math.round(metrics.wpm))} />
        <Stat label="accurate wpm" value={String(Math.round(metrics.accurateWpm))} />
        <Stat label="error rate" value={`${(metrics.errorRate * 100).toFixed(1)}%`} />
        <Stat label="keystrokes" value={String(metrics.totalKeystrokes)} />
      </div>

      <div className="mb-8 rounded-lg border border-ink-border bg-ink-surface p-4">
        <h3 className="mb-3 text-sm text-ink-muted">per-key heat map</h3>
        {keymap ? (
          <HeatMap keymap={keymap} keyStats={keyStats} />
        ) : (
          <p className="text-sm text-ink-muted">
            No keymap loaded — load a <span className="font-mono">.keymap</span> file to see the
            heat map.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onAgain}
          className="rounded bg-accent px-4 py-2 font-semibold text-ink-bg hover:opacity-90"
        >
          practice again
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
