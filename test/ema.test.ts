import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEma, foldSample, foldKeystrokes } from "../src/server/ema";
import type { KeystrokeRecord } from "../src/shared/types";

function ks(index: number, expectedChar: string, correct: boolean, latencyMs: number): KeystrokeRecord {
  return { index, expectedChar, actualChar: correct ? expectedChar : "?", latencyMs, correct };
}

const approx = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("applyEma: first sample seeds, then exact weighted blend", () => {
  assert.equal(applyEma(null, 10, 0.2), 10);
  approx(applyEma(10, 20, 0.2), 12); // 0.2*20 + 0.8*10
  approx(applyEma(12, 0, 0.2), 9.6); // 0.8*12
});

test("foldSample seeds on first sight and increments samples", () => {
  const s1 = foldSample(undefined, 100, 0, 0.2);
  assert.deepEqual(s1, { speedEma: 100, errorRateEma: 0, samples: 1 });
  const s2 = foldSample(s1, 200, 1, 0.2);
  assert.equal(s2.samples, 2);
  assert.equal(s2.speedEma, 0.2 * 200 + 0.8 * 100); // 120
  assert.equal(s2.errorRateEma, 0.2 * 1 + 0.8 * 0); // 0.2
});

test("foldKeystrokes: per-key EMA over a known sequence", () => {
  // expected "aa": first 'a' 100ms correct, second 'a' 200ms wrong.
  const seq = [ks(0, "a", true, 100), ks(1, "a", false, 200)];
  const { keys } = foldKeystrokes(seq, 0.2);
  const a = keys.get("a")!;
  assert.equal(a.samples, 2);
  assert.equal(a.speedEma, 0.2 * 200 + 0.8 * 100); // 120
  assert.equal(a.errorRateEma, 0.2 * 1 + 0.8 * 0); // 0.2
});

test("foldKeystrokes: bigram only forms at consecutive text positions", () => {
  // "the" typed cleanly -> bigrams "th","he"; count == len-1.
  const seq = [ks(0, "t", true, 100), ks(1, "h", true, 150), ks(2, "e", true, 120)];
  const { bigrams } = foldKeystrokes(seq, 0.2);
  assert.deepEqual([...bigrams.keys()].sort(), ["he", "th"]);
  assert.equal(bigrams.get("th")!.speedEma, 150); // latency of the 2nd char
  assert.equal(bigrams.get("th")!.samples, 1);
});

test("foldKeystrokes: re-typed position does not create a phantom bigram", () => {
  // expected "th": t@0 ok, x@1 wrong (expected h), h@1 corrected.
  const seq = [ks(0, "t", true, 100), ks(1, "h", false, 200), ks(1, "h", true, 90)];
  const { bigrams } = foldKeystrokes(seq, 0.2);
  // Only "th" (positions 0->1) forms; the same-index retype pair (1->1) does not.
  assert.deepEqual([...bigrams.keys()], ["th"]);
  const th = bigrams.get("th")!;
  assert.equal(th.samples, 1);
  assert.equal(th.errorRateEma, 1, "bigram counts as an error when either char was wrong");
});

test("EMA is order-dependent", () => {
  const ab = foldKeystrokes([ks(0, "a", true, 100), ks(1, "a", true, 300)], 0.2).keys.get("a")!;
  const ba = foldKeystrokes([ks(0, "a", true, 300), ks(1, "a", true, 100)], 0.2).keys.get("a")!;
  assert.notEqual(ab.speedEma, ba.speedEma);
});

test("folding the same sequence twice is identical (deterministic)", () => {
  const seq = [ks(0, "h", true, 110), ks(1, "i", false, 240), ks(2, "i", true, 90)];
  const a = foldKeystrokes(seq, 0.2);
  const b = foldKeystrokes(seq, 0.2);
  assert.deepEqual([...a.keys.entries()], [...b.keys.entries()]);
  assert.deepEqual([...a.bigrams.entries()], [...b.bigrams.entries()]);
});
