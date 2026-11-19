import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db";
import { saveSession } from "../src/server/sessions";
import {
  rebuildAggregatesFromKeystrokes,
  computeSessionKeyStats,
  readOrderedKeystrokes,
} from "../src/server/aggregate";
import { LAYOUT_FINGERPRINT, WARMUP_SAMPLES } from "../src/shared/constants";
import type { KeystrokeRecord, SessionPayload } from "../src/shared/types";

function payloadFromText(text: string, startedAt: number): SessionPayload {
  const keystrokes: KeystrokeRecord[] = Array.from(text).map((c, i) => ({
    index: i,
    expectedChar: c,
    actualChar: c,
    latencyMs: 80 + (i % 7) * 10,
    correct: true,
  }));
  return {
    startedAt,
    endedAt: startedAt + 30_000,
    mode: "random",
    targetSeconds: 30,
    targetChars: text.length,
    keystrokes,
  };
}

function snapshot(db: ReturnType<typeof openDb>) {
  const round = (n: number) => Math.round(n * 1e9) / 1e9;
  const keys = (
    db
      .prepare(
        "SELECT key, latency_ms_ema, error_rate_ema, samples FROM key_stats ORDER BY key",
      )
      .all() as Array<{ key: string; latency_ms_ema: number; error_rate_ema: number; samples: number }>
  ).map((r) => ({ ...r, latency_ms_ema: round(r.latency_ms_ema), error_rate_ema: round(r.error_rate_ema) }));
  const bigrams = (
    db
      .prepare(
        "SELECT bigram, latency_ms_ema, error_rate_ema, samples FROM bigram_stats ORDER BY bigram",
      )
      .all() as Array<{ bigram: string; latency_ms_ema: number; error_rate_ema: number; samples: number }>
  ).map((r) => ({ ...r, latency_ms_ema: round(r.latency_ms_ema), error_rate_ema: round(r.error_rate_ema) }));
  return { keys, bigrams };
}

test("rebuild == incrementally-maintained aggregates (no-drift invariant)", () => {
  const db = openDb(":memory:");
  const lines = [
    "the quick brown fox",
    "explain how a hash map works",
    "write a function that reverses a string",
    "the the the the",
  ];
  lines.forEach((line, i) => saveSession(db, payloadFromText(line, 1_000 + i * 100_000)));

  const incremental = snapshot(db);
  rebuildAggregatesFromKeystrokes(db, LAYOUT_FINGERPRINT, Date.now());
  const rebuilt = snapshot(db);

  // The corpus above drives several keys (e.g. high-frequency letters) well past
  // the warmup window, so deepEqual confirms no-drift holds ACROSS the
  // warmup→live transition, not just within the all-mean cold-start phase.
  assert.ok(
    incremental.keys.some((k) => k.samples > WARMUP_SAMPLES),
    "fixture must push at least one key past the warmup boundary",
  );
  assert.deepEqual(rebuilt, incremental);
  db.close();
});

test("session_key_stats has exactly one row per (session, key)", () => {
  const db = openDb(":memory:");
  const row = saveSession(db, payloadFromText("aabbcc", 5_000));
  const stats = db
    .prepare("SELECT key, samples FROM session_key_stats WHERE session_id = ? ORDER BY key")
    .all(row.id) as Array<{ key: string; samples: number }>;
  // expected keys: a, b, c -> 3 distinct rows; "aabbcc" => 2 samples each.
  assert.deepEqual(stats, [
    { key: "a", samples: 2 },
    { key: "b", samples: 2 },
    { key: "c", samples: 2 },
  ]);
  db.close();
});

test("computeSessionKeyStats: mean latency and error rate per key", () => {
  const ks: KeystrokeRecord[] = [
    { index: 0, expectedChar: "a", actualChar: "a", latencyMs: 100, correct: true },
    { index: 1, expectedChar: "a", actualChar: "x", latencyMs: 300, correct: false },
    { index: 2, expectedChar: "b", actualChar: "b", latencyMs: 200, correct: true },
  ];
  const stats = computeSessionKeyStats(ks).sort((x, y) => x.key.localeCompare(y.key));
  assert.deepEqual(stats, [
    { key: "a", meanLatencyMs: 200, errorRate: 0.5, samples: 2 },
    { key: "b", meanLatencyMs: 200, errorRate: 0, samples: 1 },
  ]);
});

function seedSessions(db: ReturnType<typeof openDb>): void {
  const lines = ["the quick brown fox", "jumps over the lazy dog", "hello there hello"];
  lines.forEach((line, i) => saveSession(db, payloadFromText(line, 2_000 + i * 100_000)));
}

test("rebuild streams keystrokes: never calls .all() on a keystrokes query", () => {
  const db = openDb(":memory:");
  seedSessions(db);
  const before = snapshot(db);

  const realPrepare = db.prepare.bind(db);
  let keystrokeStatements = 0;
  (db as { prepare: typeof db.prepare }).prepare = ((sql: string) => {
    const stmt = realPrepare(sql);
    if (sql.includes("FROM keystrokes")) {
      keystrokeStatements++;
      stmt.all = () => {
        throw new Error(`.all() called on keystrokes query: ${sql}`);
      };
    }
    return stmt;
  }) as typeof db.prepare;

  rebuildAggregatesFromKeystrokes(db, LAYOUT_FINGERPRINT, Date.now());
  (db as { prepare: typeof db.prepare }).prepare = realPrepare;

  assert.ok(keystrokeStatements > 0, "rebuild must have read the keystrokes table");
  assert.deepEqual(snapshot(db), before);
  db.close();
});

test("readOrderedKeystrokes returns a lazy iterable matching the full id-ordered read", () => {
  const db = openDb(":memory:");
  seedSessions(db);

  const result = readOrderedKeystrokes(db);
  assert.equal(Array.isArray(result), false);
  assert.equal(typeof result[Symbol.iterator], "function");

  const expected = (
    db
      .prepare("SELECT idx, expected_key, actual_key, latency_ms, correct FROM keystrokes ORDER BY id")
      .all() as Array<{ idx: number; expected_key: string; actual_key: string; latency_ms: number; correct: number }>
  ).map((r) => ({
    index: r.idx,
    expectedChar: r.expected_key,
    actualChar: r.actual_key,
    latencyMs: r.latency_ms,
    correct: !!r.correct,
  }));
  const streamed = [...result];
  assert.ok(streamed.length > 0);
  assert.deepEqual(streamed, expected);
  db.close();
});
