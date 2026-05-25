import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics } from "../src/shared/metrics";
import type { KeystrokeRecord } from "../src/shared/types";

const ONE_MIN = 60_000;

function ks(
  index: number,
  expectedChar: string,
  actualChar: string,
  latencyMs = 100,
): KeystrokeRecord {
  return { index, expectedChar, actualChar, latencyMs, correct: expectedChar === actualChar };
}

function correctRun(text: string): KeystrokeRecord[] {
  return Array.from(text).map((c, i) => ks(i, c, c));
}

test("perfect run: raw == accurate, zero errors", () => {
  const m = computeMetrics(correctRun("hello"), ONE_MIN);
  assert.equal(m.totalKeystrokes, 5);
  assert.equal(m.errorKeystrokes, 0);
  assert.equal(m.wpm, 1); // 5 chars / 5 / 1 min
  assert.equal(m.accurateWpm, 1);
  assert.equal(m.errorRate, 0);
  assert.equal(m.wpm, m.accurateWpm);
});

test("uncorrected error: counted, accurate WPM drops below raw", () => {
  // "hello" but last char typed wrong and never fixed.
  const k = [ks(0, "h", "h"), ks(1, "e", "e"), ks(2, "l", "l"), ks(3, "l", "l"), ks(4, "o", "p")];
  const m = computeMetrics(k, ONE_MIN);
  assert.equal(m.totalKeystrokes, 5);
  assert.equal(m.errorKeystrokes, 1);
  assert.equal(m.correctKeystrokes, 4);
  assert.equal(m.wpm, 1); // 5 typed / 5
  assert.equal(m.accurateWpm, 0.8); // 4 correct / 5
  assert.equal(m.errorRate, 1 / 5);
});

test("corrected error: error still counted, accurate WPM unchanged vs perfect", () => {
  // "hello" with index 4 typed wrong ('p'), then corrected ('o').
  const perfect = computeMetrics(correctRun("hello"), ONE_MIN);
  const corrected = [
    ks(0, "h", "h"),
    ks(1, "e", "e"),
    ks(2, "l", "l"),
    ks(3, "l", "l"),
    ks(4, "o", "p"), // wrong attempt — stays counted as an error
    ks(4, "o", "o"), // correction
  ];
  const m = computeMetrics(corrected, ONE_MIN);
  assert.equal(m.totalKeystrokes, 6);
  assert.equal(m.errorKeystrokes, 1, "the corrected mistake is still an error");
  assert.equal(m.correctKeystrokes, 5);
  assert.equal(m.accurateWpm, perfect.accurateWpm, "net WPM credits final correct text");
  assert.ok(m.wpm > m.accurateWpm, "raw WPM is inflated by the extra keystroke");
  assert.equal(m.errorRate, 1 / 6);
});

test("empty / zero-duration input is all zeros", () => {
  assert.deepEqual(computeMetrics([], ONE_MIN), {
    wpm: 0,
    accurateWpm: 0,
    errorRate: 0,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    errorKeystrokes: 0,
  });
  const m = computeMetrics(correctRun("abc"), 0);
  assert.equal(m.wpm, 0);
  assert.equal(m.accurateWpm, 0);
});
