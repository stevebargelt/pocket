import { useEffect, useState } from "react";
import type { HistoryEntry } from "../../shared/types";
import { api } from "../api";
import { HeatMap } from "../components/HeatMap";
import { TrendChart } from "./TrendChart";

export function HistoryView() {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    api
      .history()
      .then((h) => {
        setHistory(h);
        setIdx(Math.max(0, h.length - 1)); // start on the most recent session
      })
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-err">Couldn't load history — is the server running?</p>;
  if (!history) return <p className="text-ink-muted">loading…</p>;
  if (history.length === 0)
    return <p className="text-ink-muted">No sessions yet. Go practice — your trends show up here.</p>;

  const current = history[idx];

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg text-ink-bright">History</h2>

      <div className="mb-8 rounded-lg border border-ink-border bg-ink-surface p-4">
        <h3 className="mb-3 text-sm text-ink-muted">WPM, accuracy & error rate over time</h3>
        <TrendChart history={history} />
      </div>

      <div className="rounded-lg border border-ink-border bg-ink-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm text-ink-muted">heat-map evolution</h3>
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="rounded border border-ink-border px-2 py-0.5 disabled:opacity-40"
            >
              ◀
            </button>
            <span className="text-ink-muted">
              session {idx + 1} / {history.length} ·{" "}
              {new Date(current.startedAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => setIdx((i) => Math.min(history.length - 1, i + 1))}
              disabled={idx === history.length - 1}
              className="rounded border border-ink-border px-2 py-0.5 disabled:opacity-40"
            >
              ▶
            </button>
          </div>
        </div>
        <div className="mb-3 flex gap-8 text-sm text-ink-muted">
          <span>
            raw wpm <span className="text-ink-bright">{Math.round(current.wpm)}</span>
          </span>
          <span>
            accurate <span className="text-ink-bright">{Math.round(current.accurateWpm)}</span>
          </span>
          <span>
            error <span className="text-ink-bright">{(current.errorRate * 100).toFixed(1)}%</span>
          </span>
        </div>
        <HeatMap key={current.id} keyStats={current.keyStats} />
      </div>
    </div>
  );
}
