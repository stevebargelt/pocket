import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { openDb, type Db } from "../src/server/db";
import { createApiRouter, type KeymapPort } from "../src/server/routes";
import { DRILL_CHORDS } from "../src/shared/chords";
import {
  CHORD_MAX_LENGTH,
  SESSION_MAX_DURATION_MS,
  SHORTCUT_MAX_ATTEMPTS,
  SHORTCUT_MAX_LATENCY_MS,
} from "../src/shared/constants";
import type { ShortcutDrillRow } from "../src/shared/types";

const FP = "fp-drill-layout";
const PORT: KeymapPort = { getActiveKeymap: () => null, getActiveFingerprint: () => FP };

async function withServer(fn: (base: string, db: Db) => Promise<void>): Promise<void> {
  const db = openDb(":memory:");
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api", createApiRouter(db, PORT));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://localhost:${port}`, db);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
}

function post(base: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/shortcut-drills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: crypto.randomUUID(),
    startedAt: 1_000,
    endedAt: 61_000,
    attempts: [
      { index: 0, expected: "cmd+c", actual: "cmd+c", latencyMs: 400.4 },
      { index: 1, expected: "ctrl+b", actual: "cmd+b", latencyMs: 300 },
      { index: 2, expected: "cmd+c", actual: "cmd+c", latencyMs: 600.6 },
      // A client-sent `correct` is ignored: the server computes it.
      { index: 3, expected: "delete", actual: "backspace", latencyMs: 250, correct: true },
    ],
    ...overrides,
  };
}

function attemptRows(db: Db) {
  return db
    .prepare(
      `SELECT drill_id, idx, expected_chord, actual_chord, latency_ms, correct
       FROM shortcut_attempts ORDER BY drill_id, idx`,
    )
    .all() as Array<{
    drill_id: number;
    idx: number;
    expected_chord: string;
    actual_chord: string;
    latency_ms: number;
    correct: number;
  }>;
}

const count = (db: Db, table: "shortcut_drills" | "shortcut_attempts") =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test("POST /api/shortcut-drills -> 201; stored attempts carry the server-computed correct and rounded latency", async () => {
  await withServer(async (base, db) => {
    const res = await post(base, validPayload());
    assert.equal(res.status, 201);
    const drill = (await res.json()) as ShortcutDrillRow;
    assert.ok(drill.id > 0);
    assert.equal(drill.startedAt, 1_000);
    assert.equal(drill.endedAt, 61_000);
    assert.equal(drill.layoutFingerprint, FP, "stamped with the active keymap fingerprint");
    assert.equal(drill.summary.overall.attempts, 4);
    assert.equal(drill.summary.overall.correct, 2);

    assert.deepEqual(
      attemptRows(db).map(({ drill_id: _d, ...r }) => r),
      [
        { idx: 0, expected_chord: "cmd+c", actual_chord: "cmd+c", latency_ms: 400, correct: 1 },
        { idx: 1, expected_chord: "ctrl+b", actual_chord: "cmd+b", latency_ms: 300, correct: 0 },
        { idx: 2, expected_chord: "cmd+c", actual_chord: "cmd+c", latency_ms: 601, correct: 1 },
        { idx: 3, expected_chord: "delete", actual_chord: "backspace", latency_ms: 250, correct: 0 },
      ],
    );
    assert.ok(attemptRows(db).every((r) => r.drill_id === drill.id));
  });
});

test("POST /api/shortcut-drills: replaying the same clientId -> 200 with the existing drill and no new rows", async () => {
  await withServer(async (base, db) => {
    const payload = validPayload();
    const first = await post(base, payload);
    assert.equal(first.status, 201);
    const created = (await first.json()) as ShortcutDrillRow;
    const drillsBefore = count(db, "shortcut_drills");
    const attemptsBefore = count(db, "shortcut_attempts");

    // A replay with a different body still returns the first write.
    const replay = await post(base, {
      ...payload,
      attempts: [{ index: 0, expected: "cmd+v", actual: "cmd+v", latencyMs: 1 }],
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), created);
    assert.equal(count(db, "shortcut_drills"), drillsBefore);
    assert.equal(count(db, "shortcut_attempts"), attemptsBefore);
  });
});

test("GET /api/shortcut-drills returns drills oldest first with per-chord summaries", async () => {
  await withServer(async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/shortcut-drills`)).json(), []);

    // Posted out of order; GET orders by startedAt.
    assert.equal((await post(base, validPayload({ startedAt: 200_000, endedAt: 230_000 }))).status, 201);
    assert.equal((await post(base, validPayload())).status, 201);

    const res = await fetch(`${base}/api/shortcut-drills`);
    assert.equal(res.status, 200);
    const drills = (await res.json()) as ShortcutDrillRow[];
    assert.equal(drills.length, 2);
    assert.deepEqual(
      drills.map((d) => d.startedAt),
      [1_000, 200_000],
    );

    const { summary } = drills[0];
    assert.deepEqual(summary.overall, {
      attempts: 4,
      correct: 2,
      accuracy: 0.5,
      meanCorrectLatencyMs: (400 + 601) / 2,
    });
    assert.deepEqual(
      summary.perChord.map((p) => p.chord),
      [...DRILL_CHORDS],
    );
    const by = new Map(summary.perChord.map((p) => [p.chord, p]));
    assert.deepEqual(by.get("cmd+c"), {
      chord: "cmd+c",
      attempts: 2,
      correct: 2,
      accuracy: 1,
      meanCorrectLatencyMs: 500.5,
    });
    assert.deepEqual(by.get("ctrl+b"), {
      chord: "ctrl+b",
      attempts: 1,
      correct: 0,
      accuracy: 0,
      meanCorrectLatencyMs: null,
    });
    assert.deepEqual(by.get("delete"), {
      chord: "delete",
      attempts: 1,
      correct: 0,
      accuracy: 0,
      meanCorrectLatencyMs: null,
    });
    assert.equal(by.get("cmd+v")!.attempts, 0);
  });
});

const attempt = (over: Record<string, unknown>) => ({
  index: 0,
  expected: "cmd+c",
  actual: "cmd+c",
  latencyMs: 100,
  ...over,
});

const INVALID: Array<[string, Record<string, unknown>, RegExp]> = [
  ["clientId missing", { clientId: undefined }, /^clientId/],
  ["clientId not a UUID", { clientId: "not-a-uuid" }, /^clientId/],
  ["startedAt negative", { startedAt: -1 }, /^startedAt/],
  ["startedAt not an integer", { startedAt: 1.5 }, /^startedAt/],
  ["endedAt not an integer", { endedAt: "61000" }, /^endedAt/],
  ["endedAt before startedAt", { startedAt: 5_000, endedAt: 4_999 }, /^endedAt must be >= startedAt/],
  ["duration over the cap", { startedAt: 0, endedAt: SESSION_MAX_DURATION_MS + 1 }, /duration/],
  ["attempts not an array", { attempts: "nope" }, /^attempts must be an array/],
  ["attempts empty", { attempts: [] }, /^attempts must be an array/],
  [
    "attempts over the cap",
    { attempts: Array.from({ length: SHORTCUT_MAX_ATTEMPTS + 1 }, (_, i) => attempt({ index: i })) },
    /^attempts must be an array/,
  ],
  ["attempt not an object", { attempts: [null] }, /^attempts\[0\] must be an object/],
  ["index negative", { attempts: [attempt({ index: -1 })] }, /^attempts\[0\]\.index/],
  ["index not an integer", { attempts: [attempt({ index: 0.5 })] }, /^attempts\[0\]\.index/],
  ["expected cmd+w (never drilled)", { attempts: [attempt({ expected: "cmd+w" })] }, /^attempts\[0\]\.expected/],
  ["expected not a drilled chord", { attempts: [attempt({ expected: "shift+cmd+z" })] }, /^attempts\[0\]\.expected/],
  ["actual empty", { attempts: [attempt({ actual: "" })] }, /^attempts\[0\]\.actual/],
  ["actual not a string", { attempts: [attempt({ actual: 7 })] }, /^attempts\[0\]\.actual/],
  [
    "actual too long",
    { attempts: [attempt({ actual: "x".repeat(CHORD_MAX_LENGTH + 1) })] },
    /^attempts\[0\]\.actual/,
  ],
  ["latencyMs negative", { attempts: [attempt({ latencyMs: -1 })] }, /^attempts\[0\]\.latencyMs/],
  [
    "latencyMs over the cap",
    { attempts: [attempt({ latencyMs: SHORTCUT_MAX_LATENCY_MS + 1 })] },
    /^attempts\[0\]\.latencyMs/,
  ],
  ["latencyMs not a number", { attempts: [attempt({ latencyMs: "100" })] }, /^attempts\[0\]\.latencyMs/],
  ["latencyMs null", { attempts: [attempt({ latencyMs: null })] }, /^attempts\[0\]\.latencyMs/],
  [
    "a later attempt is invalid",
    { attempts: [attempt({}), attempt({ index: 1, expected: "cmd+q" })] },
    /^attempts\[1\]\.expected/,
  ],
];

for (const [name, overrides, message] of INVALID) {
  test(`POST /api/shortcut-drills -> 400: ${name}`, async () => {
    await withServer(async (base, db) => {
      const res = await post(base, validPayload(overrides));
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, message);
      assert.equal(count(db, "shortcut_drills"), 0, "nothing stored on a rejected payload");
      assert.equal(count(db, "shortcut_attempts"), 0);
    });
  });
}

test("POST /api/shortcut-drills accepts boundary values (max attempts, max latency, max chord length, zero duration)", async () => {
  await withServer(async (base, db) => {
    const res = await post(
      base,
      validPayload({
        startedAt: 0,
        endedAt: 0,
        attempts: Array.from({ length: SHORTCUT_MAX_ATTEMPTS }, (_, i) =>
          attempt({
            index: i,
            latencyMs: i === 0 ? SHORTCUT_MAX_LATENCY_MS : 0,
            actual: i === 1 ? "x".repeat(CHORD_MAX_LENGTH) : "cmd+c",
          }),
        ),
      }),
    );
    assert.equal(res.status, 201);
    assert.equal(count(db, "shortcut_attempts"), SHORTCUT_MAX_ATTEMPTS);
  });
});
