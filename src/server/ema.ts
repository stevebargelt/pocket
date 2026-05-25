import type { KeystrokeRecord } from "../shared/types";
import { EMA_ALPHA, WARMUP_SAMPLES } from "../shared/constants";
import { bigramOf } from "../shared/bigrams";

// The one pure, deterministic fold used by BOTH the incremental write path and
// the full rebuild. Recency-weighting is by construction: older samples decay
// geometrically. Because EMA is a left fold, applying new samples to an
// existing EMA in timestamp order yields exactly the same result as folding the
// whole ordered sequence from scratch — that is the no-drift invariant the
// rebuild relies on.
//
// Warmup: seeding the EMA at the very first sample over-weights early data, so
// for the first WARMUP_SAMPLES samples the stored value is the simple running
// mean; once the window fills, that warmup mean becomes the EMA seed and every
// later sample folds in as a live EMA. The branch is chosen purely by the
// running sample count (identical between the incremental and rebuild paths), so
// the no-drift invariant survives the warmup→live transition unchanged.

export interface FoldStat {
  latencyMsEma: number;
  errorRateEma: number;
  samples: number;
}

export interface FoldResult {
  keys: Map<string, FoldStat>;
  bigrams: Map<string, FoldStat>;
}

/** ema' = alpha*sample + (1-alpha)*ema. The first sample seeds the EMA. */
export function applyEma(prev: number | null, sample: number, alpha = EMA_ALPHA): number {
  if (prev === null) return sample;
  return alpha * sample + (1 - alpha) * prev;
}

/** Running arithmetic mean: mean_n = mean_{n-1} + (sample - mean_{n-1}) / n. */
export function applyMean(prev: number | null, sample: number, n: number): number {
  if (prev === null) return sample;
  return prev + (sample - prev) / n;
}

/** Fold one (latency, error) sample into a stat, creating it on first sight. */
export function foldSample(
  prev: FoldStat | undefined,
  latencySample: number,
  errorSample: number,
  alpha = EMA_ALPHA,
): FoldStat {
  const samples = (prev?.samples ?? 0) + 1;
  // Warmup window → running mean; past it → live EMA. Both fields share the same
  // sample count, so they cross the warmup boundary together. The choice is a
  // pure function of `samples`, keeping the incremental and rebuild paths in
  // lockstep across the transition.
  const fold = (p: number | null, sample: number): number =>
    samples <= WARMUP_SAMPLES ? applyMean(p, sample, samples) : applyEma(p, sample, alpha);
  return {
    latencyMsEma: fold(prev?.latencyMsEma ?? null, latencySample),
    errorRateEma: fold(prev?.errorRateEma ?? null, errorSample),
    samples,
  };
}

function accumulate(
  map: Map<string, FoldStat>,
  unit: string,
  latencySample: number,
  errorSample: number,
  alpha: number,
): void {
  map.set(unit, foldSample(map.get(unit), latencySample, errorSample, alpha));
}

/**
 * Fold an ordered keystroke stream into per-key and per-bigram EMA stats.
 *
 * Per-key: every keystroke attempt contributes (latency, wrong?).
 * Per-bigram: each pair of consecutive keystrokes that sit at consecutive text
 * positions (`next.index === cur.index + 1`) contributes. That index check
 * makes the unit text-space (so it matches `extractBigrams` / `containsBigram`),
 * skips re-typed-position artifacts, and never forms a bigram across a session
 * boundary (each session's indexes restart at 0).
 */
export function foldKeystrokes(
  ordered: KeystrokeRecord[],
  alpha = EMA_ALPHA,
  seed?: FoldResult,
): FoldResult {
  const keys = seed?.keys ?? new Map<string, FoldStat>();
  const bigrams = seed?.bigrams ?? new Map<string, FoldStat>();

  for (let i = 0; i < ordered.length; i++) {
    const k = ordered[i];
    accumulate(keys, k.expectedChar, k.latencyMs, k.correct ? 0 : 1, alpha);

    const next = ordered[i + 1];
    if (next && next.index === k.index + 1) {
      const unit = bigramOf(k.expectedChar, next.expectedChar);
      const bothCorrect = k.correct && next.correct;
      accumulate(bigrams, unit, next.latencyMs, bothCorrect ? 0 : 1, alpha);
    }
  }

  return { keys, bigrams };
}
