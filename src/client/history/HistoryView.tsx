import { useEffect, useState } from "react";
import type { HistoryEntry } from "../../shared/types";
import { CONTEXT_LABELS, type Context } from "../../shared/constants";
import { summarizeByContext } from "../../shared/summary";
import { api } from "../api";
import { HeatMap } from "../components/HeatMap";
import { ContextSummary } from "./ContextSummary";
import { TrendChart } from "./TrendChart";

type Filter = Context | "all";

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-0.5 ${
        active
          ? "border border-ink-border bg-ink-surface text-ink-bright"
          : "text-ink-muted hover:text-ink-text"
      }`}
    >
      {children}
    </button>
  );
}

export function HistoryView() {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");

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

  // Summary spans ALL contexts (unfiltered); the picker below only narrows the
  // trend chart and heat-map navigator beneath it.
  const summaries = summarizeByContext(history, Date.now());
  const filtered = filter === "all" ? history : history.filter((h) => h.context === filter);
  const safeIdx = Math.min(idx, Math.max(0, filtered.length - 1));
  const current = filtered[safeIdx];

  // Filter options are only the contexts the user has actually practiced, so a
  // selected filter always has at least one session.
  function selectFilter(f: Filter) {
    setFilter(f);
    const next = f === "all" ? history! : history!.filter((h) => h.context === f);
    setIdx(Math.max(0, next.length - 1));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg text-ink-bright">History</h2>

      <ContextSummary summaries={summaries} />

      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="mr-1 text-xs uppercase tracking-wide text-ink-muted">filter</span>
        <FilterButton active={filter === "all"} onClick={() => selectFilter("all")}>
          all
        </FilterButton>
        {summaries.map((s) => (
          <FilterButton
            key={s.context}
            active={filter === s.context}
            onClick={() => selectFilter(s.context)}
          >
            {CONTEXT_LABELS[s.context]}
          </FilterButton>
        ))}
      </div>

      <div className="mb-8 rounded-lg border border-ink-border bg-ink-surface p-4">
        <h3 className="mb-3 text-sm text-ink-muted">WPM, accuracy & error rate over time</h3>
        <TrendChart history={filtered} />
      </div>

      <div className="rounded-lg border border-ink-border bg-ink-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm text-ink-muted">heat-map evolution</h3>
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setIdx(Math.max(0, safeIdx - 1))}
              disabled={safeIdx === 0}
              className="rounded border border-ink-border px-2 py-0.5 disabled:opacity-40"
            >
              ◀
            </button>
            <span className="text-ink-muted">
              session {safeIdx + 1} / {filtered.length} ·{" "}
              {new Date(current.startedAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => setIdx(Math.min(filtered.length - 1, safeIdx + 1))}
              disabled={safeIdx === filtered.length - 1}
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
