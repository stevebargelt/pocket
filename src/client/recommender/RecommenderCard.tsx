import { useEffect, useState } from "react";
import type { PracticeMode, Recommendation, WeakUnit } from "../../shared/types";
import { type Context, CONTEXT_LABELS } from "../../shared/constants";
import { api } from "../api";

function unitLabel(u: string): string {
  return u.replace(/ /g, "␣");
}

function Chips({ units }: { units: WeakUnit[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {units.map((u) => (
        <span
          key={u.unit}
          className="rounded bg-ink-bg px-2 py-0.5 font-mono text-sm text-accent"
          title={`${Math.round(u.speedEma)}ms · ${(u.errorRateEma * 100).toFixed(0)}% err · ${u.samples} samples`}
        >
          {unitLabel(u.unit)}
        </span>
      ))}
    </div>
  );
}

export function RecommenderCard({ onStart, context }: { onStart: (mode: PracticeMode) => void; context?: Context }) {
  const contextLabel = context ? CONTEXT_LABELS[context] : "prompts";
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.recommendation().then(setRec).catch(() => setError(true));
  }, []);

  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-ink-border bg-ink-surface p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg text-ink-bright">Today's practice</h2>
        <span
          className="rounded bg-accent-dim px-2 py-0.5 text-xs uppercase tracking-wide text-ink-bright"
          title="A transparent rule of thumb, not science. Ignore it whenever you like."
        >
          heuristic
        </span>
      </div>

      {error && <p className="text-err">Couldn't load a recommendation — is the server running?</p>}

      {rec && !rec.hasEnoughData && (
        <p className="mb-5 text-sm text-ink-muted">{rec.why}</p>
      )}

      {rec && rec.hasEnoughData && (
        <div className="mb-5 space-y-3">
          <p className="text-sm text-ink-text">{rec.why}</p>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="w-20 text-ink-muted">weak keys</span>
              <Chips units={rec.weakKeys} />
            </div>
            {rec.weakBigrams.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="w-20 text-ink-muted">bigrams</span>
                <Chips units={rec.weakBigrams} />
              </div>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            suggested: a <span className="text-ink-bright">{rec.targetMinutes}-minute</span> session
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onStart("targeted")}
          disabled={!rec || !rec.hasEnoughData}
          className="rounded bg-accent px-4 py-2 font-semibold text-ink-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          title={rec && !rec.hasEnoughData ? "Need more data before targeting" : "Practice your weak spots"}
        >
          practice my weak spots
        </button>
        <button
          onClick={() => onStart("random")}
          className="rounded border border-ink-border px-4 py-2 text-ink-text hover:bg-ink-bg"
        >
          {rec && rec.hasEnoughData ? `ignore — random ${contextLabel}` : `start with random ${contextLabel}`}
        </button>
      </div>
    </div>
  );
}
