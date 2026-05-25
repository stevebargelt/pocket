// Cross-context summary: per-context WPM/accuracy plus an honest recent-trend
// delta, built purely from session-level history rows. No per-key data and no
// I/O — `nowMs` is injected so the rolling windows are deterministic (D5).

import { CONTEXTS, SUMMARY_MIN_SESSIONS, SUMMARY_WINDOW_DAYS } from "./constants";
import type { Context } from "./constants";

/**
 * The minimal session-level shape the summary needs. `HistoryEntry` (and the
 * `SessionRow` it extends) satisfy it structurally, so the /api/history payload
 * passes straight in without mapping.
 */
export interface SummaryEntry {
  context: string;
  startedAt: number;
  wpm: number;
  errorRate: number;
}

/** One context's all-time standing plus its recent trend. */
export interface ContextSummary {
  context: Context;
  /** Sessions recorded in this context, all-time. */
  sessions: number;
  /** Mean raw WPM across all of this context's sessions. */
  meanWpm: number;
  /** Mean accuracy (0..1) across all of this context's sessions; = 1 - mean error rate. */
  meanAccuracy: number;
  /**
   * Signed % change in mean WPM, current window vs the immediately prior window.
   * Null when the delta couldn't be computed (a window short of
   * SUMMARY_MIN_SESSIONS, or a zero prior baseline).
   */
  deltaPct: number | null;
  /** Human trend fragment: "12% faster", "8% slower", "flat", or "not enough data yet". */
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Within ±this % the trend reads as "flat" rather than a tiny faster/slower
 * number — ordinary session-to-session noise shouldn't masquerade as progress.
 */
const FLAT_BAND_PCT = 2;

const NOT_ENOUGH = "not enough data yet";

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function trendLabel(deltaPct: number): string {
  if (Math.abs(deltaPct) < FLAT_BAND_PCT) return "flat";
  const pct = Math.abs(Math.round(deltaPct));
  return deltaPct > 0 ? `${pct}% faster` : `${pct}% slower`;
}

/**
 * Group session-level history by context and, per context, report mean WPM,
 * mean accuracy, and a recent-trend delta. The delta compares the current
 * SUMMARY_WINDOW_DAYS window against the window immediately before it, and is
 * only emitted when BOTH windows clear SUMMARY_MIN_SESSIONS — otherwise the
 * context is flagged "not enough data yet".
 *
 * Returns one row per context the user has actually practiced, in picker
 * (CONTEXTS) order. Context values outside CONTEXTS are ignored.
 */
export function summarizeByContext(entries: SummaryEntry[], nowMs: number): ContextSummary[] {
  const byContext = new Map<string, SummaryEntry[]>();
  for (const e of entries) {
    const list = byContext.get(e.context);
    if (list) list.push(e);
    else byContext.set(e.context, [e]);
  }

  const windowMs = SUMMARY_WINDOW_DAYS * DAY_MS;
  const currentStart = nowMs - windowMs;
  const priorStart = nowMs - 2 * windowMs;

  const out: ContextSummary[] = [];
  for (const context of CONTEXTS) {
    const rows = byContext.get(context);
    if (!rows || rows.length === 0) continue;

    const meanWpm = mean(rows.map((r) => r.wpm));
    const meanAccuracy = 1 - mean(rows.map((r) => r.errorRate));

    // Half-open windows so each session lands in at most one: current is
    // (currentStart, now], prior is (priorStart, currentStart].
    const current = rows.filter((r) => r.startedAt > currentStart);
    const prior = rows.filter((r) => r.startedAt > priorStart && r.startedAt <= currentStart);

    let deltaPct: number | null = null;
    let label = NOT_ENOUGH;
    if (current.length >= SUMMARY_MIN_SESSIONS && prior.length >= SUMMARY_MIN_SESSIONS) {
      const priorWpm = mean(prior.map((r) => r.wpm));
      const currentWpm = mean(current.map((r) => r.wpm));
      if (priorWpm > 0) {
        deltaPct = ((currentWpm - priorWpm) / priorWpm) * 100;
        label = trendLabel(deltaPct);
      }
    }

    out.push({ context, sessions: rows.length, meanWpm, meanAccuracy, deltaPct, label });
  }

  return out;
}
