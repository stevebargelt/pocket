import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server/app";
import { openDb } from "../src/server/db";
import { saveSession } from "../src/server/sessions";
import {
  rebuildAggregatesFromKeystrokes,
  computeSessionKeyStats,
  readOrderedKeystrokes,
} from "../src/server/aggregate";
import type { KeymapPort } from "../src/server/routes";
import { buildDrillPrompts } from "../src/shared/chords";
import { LAYOUT_FINGERPRINT, WARMUP_SAMPLES } from "../src/shared/constants";
import type { KeystrokeRecord, SessionPayload, ShortcutDrillRow } from "../src/shared/types";

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
  rebuildAggregatesFromKeystrokes(db, Date.now());
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

/** Sessions on the default layout plus one on a second layout. */
function seedSessions(db: ReturnType<typeof openDb>): void {
  const lines = ["the quick brown fox", "jumps over the lazy dog", "hello there hello"];
  lines.forEach((line, i) => saveSession(db, payloadFromText(line, 2_000 + i * 100_000)));
  saveSession(db, payloadFromText("other layout text", 500_000), "fp-other-layout");
}

test("rebuild streams keystrokes: never calls .all() on a keystrokes query", () => {
  const db = openDb(":memory:");
  seedSessions(db);
  const before = snapshotByLayout(db);

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

  rebuildAggregatesFromKeystrokes(db, Date.now());
  (db as { prepare: typeof db.prepare }).prepare = realPrepare;

  assert.equal(keystrokeStatements, 2, "rebuild must stream the keystrokes of each of the two layouts");
  assert.deepEqual(snapshotByLayout(db), before);
  db.close();
});

test("readOrderedKeystrokes returns a lazy iterable of one layout's keystrokes in id order", () => {
  const db = openDb(":memory:");
  seedSessions(db);

  const result = readOrderedKeystrokes(db, LAYOUT_FINGERPRINT);
  assert.equal(Array.isArray(result), false);
  assert.equal(typeof result[Symbol.iterator], "function");

  const expected = (
    db
      .prepare(
        `SELECT k.idx, k.expected_key, k.actual_key, k.latency_ms, k.correct
         FROM keystrokes k JOIN sessions s ON s.id = k.session_id
         WHERE s.layout_fingerprint = ? ORDER BY k.id`,
      )
      .all(LAYOUT_FINGERPRINT) as Array<{ idx: number; expected_key: string; actual_key: string; latency_ms: number; correct: number }>
  ).map((r) => ({
    index: r.idx,
    expectedChar: r.expected_key,
    actualChar: r.actual_key,
    latencyMs: r.latency_ms,
    correct: !!r.correct,
  }));
  const streamed = [...result];
  assert.ok(streamed.length > 0);
  const total = (db.prepare("SELECT COUNT(*) AS n FROM keystrokes").get() as { n: number }).n;
  assert.ok(streamed.length < total, "the other layout's keystrokes must be excluded");
  assert.deepEqual(streamed, expected);
  db.close();
});

// --- PKT-13: rebuild is per layout ---------------------------------------

const FP_A = "fp-layout-a";
const FP_B = "fp-layout-b";

/** key_stats + bigram_stats rows grouped by layout fingerprint. */
function snapshotByLayout(db: ReturnType<typeof openDb>) {
  const round = (n: number) => Math.round(n * 1e9) / 1e9;
  const read = (table: "key_stats" | "bigram_stats", unit: "key" | "bigram") =>
    (
      db
        .prepare(
          `SELECT layout_fingerprint AS fp, ${unit} AS unit, latency_ms_ema, error_rate_ema, samples
           FROM ${table} ORDER BY layout_fingerprint, ${unit}`,
        )
        .all() as Array<{ fp: string; unit: string; latency_ms_ema: number; error_rate_ema: number; samples: number }>
    ).map((r) => ({ ...r, latency_ms_ema: round(r.latency_ms_ema), error_rate_ema: round(r.error_rate_ema) }));
  return { keys: read("key_stats", "key"), bigrams: read("bigram_stats", "bigram") };
}

/** Interleave sessions on two layouts, with distinct latencies per layout. */
function seedTwoLayouts(db: ReturnType<typeof openDb>): void {
  const sessions: Array<[string, string]> = [
    ["the quick brown fox", FP_A],
    ["explain how a hash map works", FP_B],
    ["write a function that reverses a string", FP_A],
    ["the the the the", FP_B],
    ["jumps over the lazy dog", FP_A],
  ];
  sessions.forEach(([line, fp], i) => {
    const p = payloadFromText(line, 10_000 + i * 100_000);
    if (fp === FP_B) p.keystrokes = p.keystrokes.map((k) => ({ ...k, latencyMs: k.latencyMs * 3 }));
    saveSession(db, p, fp);
  });
}

async function postRebuild(db: ReturnType<typeof openDb>): Promise<void> {
  const app = createApp(db, { distDir: null });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/rebuild`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("POST /api/rebuild: each layout's stats equal its incrementally maintained ones (no-drift per layout)", async () => {
  const db = openDb(":memory:");
  seedTwoLayouts(db);
  const incremental = snapshotByLayout(db);
  assert.deepEqual(
    [...new Set(incremental.keys.map((r) => r.fp))],
    [FP_A, FP_B],
    "fixture must populate stats under both layouts",
  );
  assert.ok(
    incremental.keys.some((k) => k.samples > WARMUP_SAMPLES),
    "fixture must push at least one key past the warmup boundary",
  );

  await postRebuild(db);

  assert.deepEqual(snapshotByLayout(db), incremental);
  db.close();
});

test("POST /api/rebuild: removes stats rows for a layout with no remaining keystrokes", async () => {
  const db = openDb(":memory:");
  seedTwoLayouts(db);
  const stale = saveSession(db, payloadFromText("zzz stale layout", 900_000), "fp-layout-gone");
  db.prepare("DELETE FROM sessions WHERE id = ?").run(stale.id); // cascades to its keystrokes
  const expected = snapshotByLayout(db);
  expected.keys = expected.keys.filter((r) => r.fp !== "fp-layout-gone");
  expected.bigrams = expected.bigrams.filter((r) => r.fp !== "fp-layout-gone");

  await postRebuild(db);

  assert.deepEqual(snapshotByLayout(db), expected);
  db.close();
});

// --- PKT-12: shortcut drills never move typing stats ----------------------

/** Run `fn` against a full app whose keymap port reports `fp` as the active layout. */
async function withAppOnLayout(
  db: ReturnType<typeof openDb>,
  fp: string,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const keymap: KeymapPort = { getActiveKeymap: () => null, getActiveFingerprint: () => fp };
  const app = createApp(db, { distDir: null, keymap });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://localhost:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A full 30-prompt drill: every chord, a mix of hits and misses. */
function drillPayload(startedAt: number) {
  return {
    clientId: crypto.randomUUID(),
    startedAt,
    endedAt: startedAt + 45_000,
    attempts: buildDrillPrompts(() => 0.5).map((expected, index) => ({
      index,
      expected,
      // Every third prompt is answered with a plain key that is also a typed
      // character, so a leak into keystrokes/key_stats could not hide.
      actual: index % 3 === 0 ? "a" : expected,
      latencyMs: 500 + index * 13,
    })),
  };
}

test("shortcut drills never change typing stats, keystrokes or history; rebuild still matches per layout (no-drift)", async () => {
  const db = openDb(":memory:");
  seedTwoLayouts(db);
  const snapshot = snapshotByLayout(db);
  assert.deepEqual([...new Set(snapshot.keys.map((r) => r.fp))], [FP_A, FP_B]);
  const keystrokeCount = () => (db.prepare("SELECT COUNT(*) AS n FROM keystrokes").get() as { n: number }).n;
  const keystrokesBefore = keystrokeCount();

  let historyBefore = 0;
  for (const [i, fp] of [FP_A, FP_B].entries()) {
    await withAppOnLayout(db, fp, async (base) => {
      if (i === 0) {
        historyBefore = ((await (await fetch(`${base}/api/history`)).json()) as unknown[]).length;
      }
      for (const startedAt of [2_000_000 + i * 100_000, 2_050_000 + i * 100_000]) {
        const res = await fetch(`${base}/api/shortcut-drills`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(drillPayload(startedAt)),
        });
        assert.equal(res.status, 201);
        assert.equal(((await res.json()) as ShortcutDrillRow).layoutFingerprint, fp);
      }
    });
  }
  assert.equal(historyBefore, 5, "fixture has five typing sessions");

  await withAppOnLayout(db, FP_A, async (base) => {
    const drills = (await (await fetch(`${base}/api/shortcut-drills`)).json()) as ShortcutDrillRow[];
    assert.deepEqual(
      drills.map((d) => d.layoutFingerprint),
      [FP_A, FP_A, FP_B, FP_B],
      "drills were recorded under both layouts",
    );

    assert.deepEqual(snapshotByLayout(db), snapshot, "key_stats/bigram_stats untouched by drills");
    assert.equal(keystrokeCount(), keystrokesBefore, "no keystrokes written by drills");
    const history = (await (await fetch(`${base}/api/history`)).json()) as unknown[];
    assert.equal(history.length, historyBefore, "no sessions written by drills");

    const rebuild = await fetch(`${base}/api/rebuild`, { method: "POST" });
    assert.equal(rebuild.status, 200);
  });

  assert.deepEqual(snapshotByLayout(db), snapshot, "rebuild == incremental per layout after drills");
  assert.equal(keystrokeCount(), keystrokesBefore);
  db.close();
});
