import { useEffect, useState } from "react";
import type { HistoryEntry, ShortcutDrillRow } from "../../shared/types";
import { CONTEXT_LABELS, type Context } from "../../shared/constants";
import { summarizeByContext } from "../../shared/summary";
import { api } from "../api";
import { HeatMap } from "../components/HeatMap";
import type { Keymap } from "../../server/keymap/types";
import { ContextSummary } from "./ContextSummary";
import { TrendChart } from "./TrendChart";
import { ShortcutTable, formatAccuracy, formatLatency } from "../drill/ShortcutResults";

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

export function HistoryView({ keymap }: { keymap: Keymap | null }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg text-ink-bright">History</h2>
      <TypingHistory keymap={keymap} />
      <ShortcutDrillHistory />
    </div>
  );
}

/**
 * Past shortcut drills, newest first. Kept apart from the typing history: drills
 * never enter the trend chart, heat map, filters or context summary.
 */
function ShortcutDrillHistory() {
  const [drills, setDrills] = useState<ShortcutDrillRow[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    api
      .shortcutDrills()
      .then((d) => setDrills([...d].reverse()))
      .catch(() => setError(true));
  }, []);

  const selected = drills?.find((d) => d.id === selectedId) ?? null;

  return (
    <section className="mt-8 rounded-lg border border-ink-border bg-ink-surface p-4" aria-label="shortcut drills">
      <h3 className="mb-3 text-sm text-ink-muted">shortcut drills</h3>
      {error && <p className="text-sm text-err">Couldn't load shortcut drills — is the server running?</p>}
      {!error && !drills && <p className="text-sm text-ink-muted">loading…</p>}
      {drills && drills.length === 0 && (
        <p className="text-sm text-ink-muted">No shortcut drills yet. Start one from the Practice view.</p>
      )}
      {drills && drills.length > 0 && (
        <ul className="mb-4 space-y-1 text-sm">
          {drills.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}
                aria-pressed={d.id === selectedId}
                className={`flex w-full gap-6 rounded px-2 py-1 text-left ${
                  d.id === selectedId
                    ? "border border-accent bg-ink-bg text-ink-bright"
                    : "border border-transparent text-ink-text hover:border-ink-border"
                }`}
              >
                <span className="w-48">{new Date(d.startedAt).toLocaleString()}</span>
                <span>
                  accuracy <span className="text-ink-bright">{formatAccuracy(d.summary.overall)}</span>
                </span>
                <span>
                  mean correct latency{" "}
                  <span className="text-ink-bright">{formatLatency(d.summary.overall)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <ShortcutTable summary={selected.summary} />}
    </section>
  );
}

function TypingHistory({ keymap }: { keymap: Keymap | null }) {
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
    <div>
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
        {keymap ? (
          <HeatMap key={current.id} keymap={keymap} keyStats={current.keyStats} />
        ) : (
          <p className="text-sm text-ink-muted">
            No keymap loaded — load a <span className="font-mono">.keymap</span> file to see the
            heat map.
          </p>
        )}
      </div>
    </div>
  );
}
