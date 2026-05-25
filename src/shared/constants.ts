// Single source of cross-cutting values shared by client and server.
// Every magic number lives here so any later change is auditable.

/** Fixed-alpha EMA weight. ema' = alpha*sample + (1-alpha)*ema. */
export const EMA_ALPHA = 0.2;

/**
 * Samples a unit must accumulate before its EMA is treated as "live". Below this
 * threshold the stored stat carries the simple running mean instead — seeding the
 * EMA at the very first sample over-weights early data, so we average until the
 * window fills, then let the warmup mean seed the live EMA. Purely a function of
 * the running sample count, so the incremental write path and a from-scratch
 * rebuild stay bit-for-bit identical (the no-drift invariant in ema.ts).
 */
export const WARMUP_SAMPLES = 3;

/** A key needs this many samples before it can be ranked "weakest". */
export const MIN_KEY_SAMPLES = 30;

/** A bigram needs this many samples before it can be ranked "weakest". */
export const MIN_BIGRAM_SAMPLES = 15;

/** How many weak keys/bigrams the recommender surfaces. */
export const TOP_N_WEAK = 5;

/**
 * v1 has no keymap reader yet, so every row is stamped with this sentinel.
 * v1.2 replaces it with a hash of the parsed ZMK keymap and can segregate
 * this pre-keymap data cleanly.
 */
export const LAYOUT_FINGERPRINT = "v1-unknown-layout";

/** Default practice session length in seconds. */
export const DEFAULT_SESSION_SECONDS = 60;

/** Recommender's suggested daily target, in minutes. */
export const RECOMMENDED_MINUTES = 10;

/** How much a unit's error rate weighs against its relative slowness when ranking weakness. */
export const WEAKNESS_ERROR_WEIGHT = 1.5;

/** How many corpus lines a generated practice text strings together. */
export const GENERATED_LINE_COUNT = 6;

/** Characters-per-word divisor used by all WPM math (industry standard). */
export const CHARS_PER_WORD = 5;

// --- v1.1: five-context corpus router ---

/** The practice contexts, in picker (display) order. The first is the default. */
export const CONTEXTS = ["prompts", "cli", "code", "email", "teams"] as const;

/** A practice context value — one of CONTEXTS. */
export type Context = (typeof CONTEXTS)[number];

/** The context a session falls back to when none is supplied. */
export const DEFAULT_CONTEXT: Context = "prompts";

/** Human-readable picker labels (most contexts read fine lowercase; CLI is an initialism). */
export const CONTEXT_LABELS: Record<Context, string> = {
  prompts: "prompts",
  cli: "CLI",
  code: "code",
  email: "email",
  teams: "teams",
};

/**
 * Per-context corpus line-length bounds (inclusive), enforced at curate/seed time.
 * Prose tolerates long sentences; code is capped tighter so practice text stays
 * typeable (overly long imports are dropped, not shipped); CLI commands are short
 * and symbol-dense, so they need a much lower minimum than prose.
 */
export const CORPUS_LINE_CAPS: Record<Context, { min: number; max: number }> = {
  prompts: { min: 12, max: 200 },
  cli: { min: 4, max: 80 },
  code: { min: 12, max: 120 },
  email: { min: 12, max: 200 },
  teams: { min: 12, max: 200 },
};

/** Rolling window (days) the cross-context summary compares against the immediately prior window. */
export const SUMMARY_WINDOW_DAYS = 30;

/** Minimum sessions required in BOTH windows before the summary emits a percentage delta. */
export const SUMMARY_MIN_SESSIONS = 3;

// --- v1.2.1: POST /api/session payload validation caps (consumed by routes.ts) ---

/** Hard ceiling on a single session's wall-clock span (endedAt - startedAt). 2 hours. */
export const SESSION_MAX_DURATION_MS = 2 * 60 * 60 * 1000;

/** Hard ceiling on any one keystroke's inter-key latency. Anything larger is corrupt input. */
export const MAX_KEYSTROKE_LATENCY_MS = 10000;
