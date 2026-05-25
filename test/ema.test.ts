import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEma, applyMean, foldSample, foldKeystrokes, type FoldStat } from "../src/server/ema";
import { WARMUP_SAMPLES } from "../src/shared/constants";
import type { KeystrokeRecord } from "../src/shared/types";

function ks(index: number, expectedChar: string, correct: boolean, latencyMs: number): KeystrokeRecord {
  return { index, expectedChar, actualChar: correct ? expectedChar : "?", latencyMs, correct };
}

/** Fold a single key's latency stream (all correct) through the real fold. */
function foldLatencies(latencies: number[]): FoldStat {
  let stat: FoldStat | undefined;
  for (const l of latencies) stat = foldSample(stat, l, 0, 0.2);
  return stat!;
}

const approx = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("WARMUP_SAMPLES is the assumed 3 (these fixtures hardcode that boundary)", () => {
  assert.equal(WARMUP_SAMPLES, 3);
});

test("applyEma: first sample seeds, then exact weighted blend", () => {
  assert.equal(applyEma(null, 10, 0.2), 10);
  approx(applyEma(10, 20, 0.2), 12); // 0.2*20 + 0.8*10
  approx(applyEma(12, 0, 0.2), 9.6); // 0.8*12
});

test("applyMean: seeds on first sample, then incremental arithmetic mean", () => {
  assert.equal(applyMean(null, 10, 1), 10);
  approx(applyMean(10, 20, 2), 15); // (10+20)/2
  approx(applyMean(15, 30, 3), 20); // (10+20+30)/3
});

test("foldSample: during warmup it carries the running mean, not an EMA seed", () => {
  const s1 = foldSample(undefined, 100, 0, 0.2);
  assert.deepEqual(s1, { latencyMsEma: 100, errorRateEma: 0, samples: 1 });
  const s2 = foldSample(s1, 200, 1, 0.2);
  assert.equal(s2.samples, 2);
  approx(s2.latencyMsEma, 150); // running mean (100+200)/2, NOT the EMA (=120)
  approx(s2.errorRateEma, 0.5); // (0+1)/2
});

test("foldKeystrokes: per-key warmup mean over a known short sequence", () => {
  // expected "aa": first 'a' 100ms correct, second 'a' 200ms wrong. Two samples
  // is still inside the warmup window, so the stat is the arithmetic mean.
  const seq = [ks(0, "a", true, 100), ks(1, "a", false, 200)];
  const { keys } = foldKeystrokes(seq, 0.2);
  const a = keys.get("a")!;
  assert.equal(a.samples, 2);
  approx(a.latencyMsEma, 150); // (100+200)/2
  approx(a.errorRateEma, 0.5); // (0+1)/2
});

test("warmup: below WARMUP_SAMPLES the stat is the simple running mean", () => {
  const s = foldLatencies([100, 200]);
  assert.equal(s.samples, 2);
  approx(s.latencyMsEma, 150); // mean, not the EMA seed 0.2*200+0.8*100=120
});

test("warmup: at WARMUP_SAMPLES the stat is the full-window mean (the EMA seed)", () => {
  const s = foldLatencies([100, 200, 300]);
  assert.equal(s.samples, 3);
  approx(s.latencyMsEma, 200); // (100+200+300)/3
});

test("warmup: past the threshold the warmup mean seeds a live EMA", () => {
  const s = foldLatencies([100, 200, 300, 400, 500]);
  assert.equal(s.samples, 5);
  // window mean after 3 = 200; then EMA: 0.2*400+0.8*200=240; 0.2*500+0.8*240=292
  approx(s.latencyMsEma, 292);
});

test("foldKeystrokes: bigram only forms at consecutive text positions", () => {
  // "the" typed cleanly -> bigrams "th","he"; count == len-1.
  const seq = [ks(0, "t", true, 100), ks(1, "h", true, 150), ks(2, "e", true, 120)];
  const { bigrams } = foldKeystrokes(seq, 0.2);
  assert.deepEqual([...bigrams.keys()].sort(), ["he", "th"]);
  assert.equal(bigrams.get("th")!.latencyMsEma, 150); // single-sample mean == latency of the 2nd char
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

test("EMA is order-dependent once past the warmup window", () => {
  // Four samples each: the mean phase is order-free, but the live-EMA tail is not.
  const a = [ks(0, "a", true, 100), ks(1, "a", true, 300), ks(2, "a", true, 100), ks(3, "a", true, 300)];
  const b = [ks(0, "a", true, 300), ks(1, "a", true, 100), ks(2, "a", true, 300), ks(3, "a", true, 100)];
  const ab = foldKeystrokes(a, 0.2).keys.get("a")!;
  const ba = foldKeystrokes(b, 0.2).keys.get("a")!;
  assert.notEqual(ab.latencyMsEma, ba.latencyMsEma);
});

test("folding the same sequence twice is identical (deterministic)", () => {
  const seq = [ks(0, "h", true, 110), ks(1, "i", false, 240), ks(2, "i", true, 90)];
  const a = foldKeystrokes(seq, 0.2);
  const b = foldKeystrokes(seq, 0.2);
  assert.deepEqual([...a.keys.entries()], [...b.keys.entries()]);
  assert.deepEqual([...a.bigrams.entries()], [...b.bigrams.entries()]);
});

test("incremental fold == from-scratch rebuild across the warmup boundary", () => {
  // Five samples for key 'a' cross WARMUP_SAMPLES into live-EMA territory.
  const seq = [
    ks(0, "a", true, 100),
    ks(1, "a", true, 200),
    ks(2, "a", true, 300),
    ks(3, "a", true, 400),
    ks(4, "a", true, 500),
  ];
  const full = foldKeystrokes(seq, 0.2).keys.get("a")!;
  // Split mid-warmup (after 2 samples) and resume from the persisted partial
  // stat — exactly what the incremental write path does. Compared per-key
  // because a split drops the bigram pair that straddles it (sessions split on
  // text-position resets, so this never happens to bigrams in practice).
  const part1 = foldKeystrokes(seq.slice(0, 2), 0.2);
  const part2 = foldKeystrokes(seq.slice(2), 0.2, part1).keys.get("a")!;
  assert.ok(full.samples > WARMUP_SAMPLES, "sequence must cross the warmup boundary");
  assert.equal(part2.samples, full.samples);
  approx(part2.latencyMsEma, full.latencyMsEma);
  approx(part2.errorRateEma, full.errorRateEma);
});
