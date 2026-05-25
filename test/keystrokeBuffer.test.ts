import { test } from "node:test";
import assert from "node:assert/strict";
import { KeystrokeBuffer } from "../src/client/session/keystrokeBuffer";

// Scripted clock so latency is deterministic and independent of wall time.
function clockFrom(times: number[]): () => number {
  let i = 0;
  return () => times[i++];
}

test("records a clean run with correct latencies and statuses", () => {
  const buf = new KeystrokeBuffer("hi", clockFrom([1000, 1150]));
  buf.type("h");
  buf.type("i");
  assert.equal(buf.records.length, 2);
  assert.deepEqual(buf.records[0], { index: 0, expectedChar: "h", actualChar: "h", latencyMs: 0, correct: true });
  assert.deepEqual(buf.records[1], { index: 1, expectedChar: "i", actualChar: "i", latencyMs: 150, correct: true });
  assert.equal(buf.statusAt(0), "correct");
  assert.equal(buf.statusAt(1), "correct");
  assert.ok(buf.done);
});

test("corrected error: wrong attempt stays recorded, retype appends at same index", () => {
  const buf = new KeystrokeBuffer("hi", clockFrom([1000, 1100, 1300]));
  buf.type("h"); // index 0, correct
  buf.type("x"); // index 1, wrong (expected 'i') — cursor advances Monkeytype-style
  assert.equal(buf.cursor, 2);
  assert.equal(buf.statusAt(1), "wrong");

  buf.backspace(); // back to index 1
  assert.equal(buf.cursor, 1);
  assert.equal(buf.statusAt(1), "untyped", "position pending retype renders as untyped");

  buf.type("i"); // retype index 1, correct
  assert.equal(buf.records.length, 3, "the wrong attempt is NOT removed");
  assert.deepEqual(buf.records[1], { index: 1, expectedChar: "i", actualChar: "x", latencyMs: 100, correct: false });
  assert.deepEqual(buf.records[2], { index: 1, expectedChar: "i", actualChar: "i", latencyMs: 200, correct: true });
  assert.equal(buf.statusAt(1), "correct", "latest attempt wins for rendering");
  assert.ok(buf.done);
});

test("backspace at position 0 is a no-op", () => {
  const buf = new KeystrokeBuffer("ab", clockFrom([0, 0, 0]));
  buf.backspace();
  assert.equal(buf.cursor, 0);
});

test("capture performs no network I/O", () => {
  const original = (globalThis as { fetch?: unknown }).fetch;
  let called = false;
  (globalThis as { fetch?: unknown }).fetch = () => {
    called = true;
    throw new Error("no fetch on the keydown path");
  };
  try {
    const buf = new KeystrokeBuffer("abc", clockFrom([0, 10, 20]));
    buf.type("a");
    buf.type("b");
    buf.type("c");
    assert.equal(called, false);
  } finally {
    (globalThis as { fetch?: unknown }).fetch = original;
  }
});
