// Single source of cross-cutting values shared by client and server.
// Every magic number lives here so any later change is auditable.

/** Fixed-alpha EMA weight. ema' = alpha*sample + (1-alpha)*ema. */
export const EMA_ALPHA = 0.2;

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
