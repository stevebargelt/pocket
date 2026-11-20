// Cross-cutting types shared by client and server.

import type { Context } from "./constants";

/** One captured keystroke. `index` is the position in the presented text. */
export interface KeystrokeRecord {
  index: number;
  expectedChar: string;
  actualChar: string;
  /** ms since the previous keystroke (monotonic, from performance.now). */
  latencyMs: number;
  correct: boolean;
}

export type PracticeMode = "targeted" | "random";

/** What the client POSTs to /api/session at the end of a session. */
export interface SessionPayload {
  startedAt: number;
  endedAt: number;
  mode: PracticeMode;
  /** Optional so v1 callers (and pre-context tests) stay valid; absent => DEFAULT_CONTEXT. */
  context?: Context;
  targetSeconds: number;
  /** Length of the presented text the user typed against. */
  targetChars: number;
  keystrokes: KeystrokeRecord[];
  /**
   * Client-generated UUID identifying this finished session, so a retried or
   * duplicated save is idempotent. Required on the wire (POST /api/session);
   * optional here so internal callers and tests of saveSession stay valid.
   */
  clientId?: string;
}

/** Computed typing metrics for a session. */
export interface SessionMetrics {
  wpm: number;
  accurateWpm: number;
  errorRate: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  errorKeystrokes: number;
}

/** A persisted session row plus its per-key heat-map data. */
export interface SessionRow {
  id: number;
  startedAt: number;
  endedAt: number;
  context: string;
  layoutFingerprint: string;
  wpm: number;
  accurateWpm: number;
  errorRate: number;
  targetWords: number;
  targetSeconds: number;
}

/** Per-key aggregate for one session (the heat-map-evolution time series). */
export interface SessionKeyStat {
  key: string;
  meanLatencyMs: number;
  errorRate: number;
  samples: number;
}

/** A session row returned by history, with its per-key heat map attached. */
export interface HistoryEntry extends SessionRow {
  keyStats: SessionKeyStat[];
}

/** A row in key_stats / bigram_stats (the EMA cache). */
export interface StatRow {
  unit: string;
  /** EMA of mean inter-keystroke latency in ms (lower = faster). */
  latencyMsEma: number;
  errorRateEma: number;
  samples: number;
}

/** A single ranked weak unit (key or bigram). */
export interface WeakUnit {
  unit: string;
  /** EMA of mean inter-keystroke latency in ms (lower = faster). */
  latencyMsEma: number;
  errorRateEma: number;
  samples: number;
  /** Relative slowness vs the user's own per-unit mean, e.g. 0.18 = 18% slower. */
  relativeSlowness: number;
  /** Composite weakness score (higher = weaker). */
  score: number;
}

export interface WeakSet {
  keys: WeakUnit[];
  bigrams: WeakUnit[];
}

/** The heuristic recommendation surfaced on session start. */
export interface Recommendation {
  /** False = cold start: not enough data to make a claim yet. */
  hasEnoughData: boolean;
  weakKeys: WeakUnit[];
  weakBigrams: WeakUnit[];
  targetMinutes: number;
  /** Human-readable, transparent rationale. */
  why: string;
  /** Always true in v1 — labels the suggestion as a heuristic in the UI. */
  isHeuristic: true;
}

// --- PKT-12: shortcut drills ---

/** One prompt in a shortcut drill as the client POSTs it. `correct` is computed server-side. */
export interface ShortcutAttemptPayload {
  /** Position of the prompt in the drill. */
  index: number;
  /** The prompted chord id (a DrillChord, e.g. `cmd+c`). */
  expected: string;
  /** The chord id the user actually pressed (any chordFromEvent output). */
  actual: string;
  /** ms from the prompt appearing to the chord being pressed. */
  latencyMs: number;
}

/** What the client POSTs to /api/shortcut-drills when a drill finishes. */
export interface ShortcutDrillPayload {
  /** Client-generated UUID; a replay with the same id is idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  attempts: ShortcutAttemptPayload[];
}

/** Accuracy and speed over a set of shortcut attempts. */
export interface ShortcutStats {
  attempts: number;
  correct: number;
  /** correct / attempts; 0 when there are no attempts. */
  accuracy: number;
  /** Mean latency of the CORRECT attempts only; null when none were correct. */
  meanCorrectLatencyMs: number | null;
}

/** ShortcutStats for one drilled chord. */
export interface ShortcutChordStats extends ShortcutStats {
  chord: string;
}

/** Overall stats plus one entry per DRILL_CHORDS chord, in display order. */
export interface ShortcutDrillSummary {
  overall: ShortcutStats;
  perChord: ShortcutChordStats[];
}

/** A stored shortcut drill with its summary, as returned by the API. */
export interface ShortcutDrillRow {
  id: number;
  startedAt: number;
  endedAt: number;
  layoutFingerprint: string;
  summary: ShortcutDrillSummary;
}
