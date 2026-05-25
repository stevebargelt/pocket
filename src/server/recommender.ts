import type { Recommendation, WeakUnit } from "../shared/types";
import { LAYOUT_FINGERPRINT, RECOMMENDED_MINUTES, TOP_N_WEAK } from "../shared/constants";
import { rankWeakBigrams, rankWeakKeys } from "./weakness";
import type { Db } from "./db";

// Heuristic practice recommender. It is explicitly a suggestion surface, never a
// gate (`isHeuristic: true`), and shows its work in `why` so the user can judge
// it. Below the samples gate it returns a transparent cold-start state instead
// of inventing a claim.

function label(unit: string): string {
  return unit.replace(/ /g, "␣");
}

function joinUnits(units: WeakUnit[]): string {
  const labels = units.map((u) => `"${label(u.unit)}"`);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function buildWhy(keys: WeakUnit[], bigrams: WeakUnit[]): string {
  const slowKeys = keys.filter((k) => k.relativeSlowness > 0).slice(0, 2);
  let sentence: string;
  if (slowKeys.length > 0) {
    const pct = Math.round(slowKeys[0].relativeSlowness * 100);
    const verb = slowKeys.length > 1 ? "are" : "is";
    sentence = `Your ${joinUnits(slowKeys)} ${verb} about ${pct}% slower than your average key.`;
  } else if (keys.length > 0) {
    sentence = `Your ${joinUnits(keys.slice(0, 2))} have your highest error rates.`;
  } else {
    sentence = `These bigrams are your slowest or most error-prone.`;
  }
  if (bigrams.length > 0) {
    sentence += ` Bigrams like ${joinUnits(bigrams.slice(0, 2))} need work too.`;
  }
  return sentence;
}

export function buildRecommendation(db: Db, fp: string = LAYOUT_FINGERPRINT): Recommendation {
  const weakKeys = rankWeakKeys(db, fp).slice(0, TOP_N_WEAK);
  const weakBigrams = rankWeakBigrams(db, fp).slice(0, TOP_N_WEAK);
  const hasEnoughData = weakKeys.length > 0 || weakBigrams.length > 0;

  if (!hasEnoughData) {
    return {
      hasEnoughData: false,
      weakKeys: [],
      weakBigrams: [],
      targetMinutes: RECOMMENDED_MINUTES,
      why: "Not enough data yet — type a few sessions and I'll start spotting the keys and bigrams that slow you down.",
      isHeuristic: true,
    };
  }

  return {
    hasEnoughData: true,
    weakKeys,
    weakBigrams,
    targetMinutes: RECOMMENDED_MINUTES,
    why: buildWhy(weakKeys, weakBigrams),
    isHeuristic: true,
  };
}
