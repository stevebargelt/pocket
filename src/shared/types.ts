// Cross-cutting types shared by client and server.

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
  targetSeconds: number;
  /** Length of the presented text the user typed against. */
  targetChars: number;
  keystrokes: KeystrokeRecord[];
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
  speedEma: number;
  errorRateEma: number;
  samples: number;
}

/** A single ranked weak unit (key or bigram). */
export interface WeakUnit {
  unit: string;
  speedEma: number;
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
