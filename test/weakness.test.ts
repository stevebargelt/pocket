import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db";
import { rankWeakest } from "../src/server/weakness";
import { buildRecommendation } from "../src/server/recommender";
import { LAYOUT_FINGERPRINT } from "../src/shared/constants";
import type { StatRow } from "../src/shared/types";

function insertKey(db: ReturnType<typeof openDb>, key: string, speed: number, err: number, samples: number) {
  db.prepare(
    "INSERT INTO key_stats (key, layout_fingerprint, speed_ema, error_rate_ema, samples, last_updated) VALUES (?,?,?,?,?,0)",
  ).run(key, LAYOUT_FINGERPRINT, speed, err, samples);
}
function insertBigram(db: ReturnType<typeof openDb>, bigram: string, speed: number, err: number, samples: number) {
  db.prepare(
    "INSERT INTO bigram_stats (bigram, layout_fingerprint, speed_ema, error_rate_ema, samples, last_updated) VALUES (?,?,?,?,?,0)",
  ).run(bigram, LAYOUT_FINGERPRINT, speed, err, samples);
}

test("rankWeakest: gates by samples and ranks slowest+most-error first", () => {
  const stats: StatRow[] = [
    { unit: "a", speedEma: 100, errorRateEma: 0, samples: 50 },
    { unit: "b", speedEma: 200, errorRateEma: 0.1, samples: 50 }, // slow + errors -> weakest
    { unit: "c", speedEma: 120, errorRateEma: 0, samples: 50 },
    { unit: "d", speedEma: 999, errorRateEma: 0.9, samples: 5 }, // ineligible: too few samples
  ];
  const ranked = rankWeakest(stats, 30);
  assert.equal(ranked.length, 3, "the sub-threshold unit is excluded");
  assert.equal(ranked[0].unit, "b", "weakest first");
  assert.ok(!ranked.some((r) => r.unit === "d"));
  // relative slowness sign matches direction vs the mean.
  assert.ok(ranked.find((r) => r.unit === "b")!.relativeSlowness > 0);
  assert.ok(ranked.find((r) => r.unit === "a")!.relativeSlowness < 0);
});

test("rankWeakest: empty when nothing crosses the gate", () => {
  const stats: StatRow[] = [{ unit: "a", speedEma: 100, errorRateEma: 0, samples: 1 }];
  assert.deepEqual(rankWeakest(stats, 30), []);
});

test("recommender: above threshold returns a ranked weak set with a numeric why", () => {
  const db = openDb(":memory:");
  insertKey(db, "a", 100, 0, 40);
  insertKey(db, "e", 110, 0, 40);
  insertKey(db, "b", 180, 0.05, 40); // clearly slow
  insertKey(db, ";", 175, 0.02, 40);
  insertKey(db, "t", 95, 0, 40);
  insertBigram(db, "th", 220, 0.1, 20);
  insertBigram(db, "he", 120, 0, 20);

  const rec = buildRecommendation(db, LAYOUT_FINGERPRINT);
  assert.equal(rec.hasEnoughData, true);
  assert.equal(rec.isHeuristic, true);
  assert.ok(rec.weakKeys.length > 0 && rec.weakKeys.length <= 5);
  assert.equal(rec.weakKeys[0].unit, "b", "slowest key ranks first");
  assert.match(rec.why, /%/, "why string is numeric/transparent");
  assert.equal(rec.targetMinutes, 10);
  db.close();
});

test("recommender: cold start returns a transparent not-enough-data state", () => {
  const db = openDb(":memory:");
  const rec = buildRecommendation(db, LAYOUT_FINGERPRINT);
  assert.equal(rec.hasEnoughData, false);
  assert.deepEqual(rec.weakKeys, []);
  assert.deepEqual(rec.weakBigrams, []);
  assert.match(rec.why, /not enough data/i);
  db.close();
});
