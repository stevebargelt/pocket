import type { StatRow, WeakUnit } from "../shared/types";
import {
  MIN_BIGRAM_SAMPLES,
  MIN_KEY_SAMPLES,
  WEAKNESS_ERROR_WEIGHT,
} from "../shared/constants";
import type { Db } from "./db";

// Weakness ranking. A unit's weakness is a composite of how slow it is relative
// to the user's OWN average speed (so it adapts to the typist, not an absolute
// bar) plus its error rate. Units below the minimum-samples gate are ineligible
// — they never appear in a weak set, which keeps the recommender honest at cold
// start.

export function rankWeakest(
  stats: StatRow[],
  minSamples: number,
  errorWeight: number = WEAKNESS_ERROR_WEIGHT,
): WeakUnit[] {
  const eligible = stats.filter((s) => s.samples >= minSamples);
  if (eligible.length === 0) return [];

  const meanSpeed = eligible.reduce((sum, s) => sum + s.speedEma, 0) / eligible.length;

  const ranked: WeakUnit[] = eligible.map((s) => {
    const relativeSlowness = meanSpeed > 0 ? (s.speedEma - meanSpeed) / meanSpeed : 0;
    const score = relativeSlowness + errorWeight * s.errorRateEma;
    return {
      unit: s.unit,
      speedEma: s.speedEma,
      errorRateEma: s.errorRateEma,
      samples: s.samples,
      relativeSlowness,
      score,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function loadStats(db: Db, table: "key_stats" | "bigram_stats", unitCol: "key" | "bigram", fp: string): StatRow[] {
  return db
    .prepare(
      `SELECT ${unitCol} AS unit, speed_ema AS speedEma, error_rate_ema AS errorRateEma, samples
       FROM ${table} WHERE layout_fingerprint = ?`,
    )
    .all(fp) as StatRow[];
}

export function rankWeakKeys(db: Db, fp: string): WeakUnit[] {
  return rankWeakest(loadStats(db, "key_stats", "key", fp), MIN_KEY_SAMPLES);
}

export function rankWeakBigrams(db: Db, fp: string): WeakUnit[] {
  return rankWeakest(loadStats(db, "bigram_stats", "bigram", fp), MIN_BIGRAM_SAMPLES);
}
