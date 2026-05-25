import type { KeystrokeRecord } from "../shared/types";
import { EMA_ALPHA } from "../shared/constants";
import { bigramOf } from "../shared/bigrams";

// The one pure, deterministic fold used by BOTH the incremental write path and
// the full rebuild. Recency-weighting is by construction: older samples decay
// geometrically. Because EMA is a left fold, applying new samples to an
// existing EMA in timestamp order yields exactly the same result as folding the
// whole ordered sequence from scratch — that is the no-drift invariant the
// rebuild relies on.

export interface FoldStat {
  speedEma: number;
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

/** Fold one (speed, error) sample into a stat, creating it on first sight. */
export function foldSample(
  prev: FoldStat | undefined,
  speedSample: number,
  errorSample: number,
  alpha = EMA_ALPHA,
): FoldStat {
  if (!prev) {
    return { speedEma: speedSample, errorRateEma: errorSample, samples: 1 };
  }
  return {
    speedEma: applyEma(prev.speedEma, speedSample, alpha),
    errorRateEma: applyEma(prev.errorRateEma, errorSample, alpha),
    samples: prev.samples + 1,
  };
}

function accumulate(
  map: Map<string, FoldStat>,
  unit: string,
  speedSample: number,
  errorSample: number,
  alpha: number,
): void {
  map.set(unit, foldSample(map.get(unit), speedSample, errorSample, alpha));
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
