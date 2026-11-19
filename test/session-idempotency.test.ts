import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server/app";
import { openDb, type Db } from "../src/server/db";
import type { KeystrokeRecord, SessionRow } from "../src/shared/types";

async function withServer(fn: (base: string, db: Db) => Promise<void>): Promise<void> {
  const db = openDb(":memory:");
  const app = createApp(db, { distDir: null });
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

const TEXT = "hello world";

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const keystrokes: KeystrokeRecord[] = Array.from(TEXT).map((c, i) => ({
    index: i,
    expectedChar: c,
    actualChar: i === 3 ? "x" : c,
    latencyMs: 100 + i * 7,
    correct: i !== 3,
  }));
  return {
    startedAt: 0,
    endedAt: 60_000,
    mode: "random",
    targetSeconds: 60,
    targetChars: TEXT.length,
    keystrokes,
    clientId: crypto.randomUUID(),
    ...overrides,
  };
}

function post(base: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const count = (db: Db, table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const keyStats = (db: Db): unknown[] =>
  db
    .prepare(
      `SELECT key, layout_fingerprint, latency_ms_ema, error_rate_ema, samples, last_updated
       FROM key_stats ORDER BY key, layout_fingerprint`,
    )
    .all();

test("replaying a POST with the same clientId returns the existing session (201 then 200)", async () => {
  await withServer(async (base, db) => {
    const body = payload();
    const nKeys = (body.keystrokes as unknown[]).length;

    const first = await post(base, body);
    assert.equal(first.status, 201, "first save creates the session");
    const a = (await first.json()) as SessionRow;
    const statsAfterFirst = keyStats(db);
    assert.ok(statsAfterFirst.length > 0, "the first save updated key_stats");
    const sessionKeyStatsAfterFirst = count(db, "session_key_stats");

    const second = await post(base, body);
    assert.equal(second.status, 200, "replay returns the existing session");
    const b = (await second.json()) as SessionRow;

    assert.equal(b.id, a.id, "same session id");
    assert.deepEqual(b, a, "same SessionRow body");
    assert.equal(count(db, "sessions"), 1, "one session row");
    assert.equal(count(db, "keystrokes"), nKeys, "keystrokes written once");
    assert.equal(count(db, "session_key_stats"), sessionKeyStatsAfterFirst, "session_key_stats untouched");
    assert.deepEqual(keyStats(db), statsAfterFirst, "key_stats samples and EMAs unchanged by the replay");
  });
});

test("a replay with a different body under the same clientId is not merged (first write wins)", async () => {
  await withServer(async (base, db) => {
    const clientId = crypto.randomUUID();
    const first = await post(base, payload({ clientId }));
    assert.equal(first.status, 201);
    const a = (await first.json()) as SessionRow;
    const stats = keyStats(db);

    const second = await post(base, payload({ clientId, endedAt: 30_000, context: "cli" }));
    assert.equal(second.status, 200);
    assert.deepEqual((await second.json()) as SessionRow, a, "original row returned unchanged");
    assert.equal(count(db, "sessions"), 1);
    assert.deepEqual(keyStats(db), stats);
  });
});

test("POSTs with different clientIds create two sessions, both 201", async () => {
  await withServer(async (base, db) => {
    const r1 = await post(base, payload());
    const r2 = await post(base, payload());
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    const a = (await r1.json()) as SessionRow;
    const b = (await r2.json()) as SessionRow;
    assert.notEqual(a.id, b.id);
    assert.equal(count(db, "sessions"), 2);
  });
});

test("POST /session rejects a missing or malformed clientId with 400 naming clientId", async () => {
  await withServer(async (base, db) => {
    const missing = payload();
    delete missing.clientId;
    const cases: Array<{ name: string; body: unknown }> = [
      { name: "missing clientId", body: missing },
      { name: "numeric clientId", body: payload({ clientId: 123 }) },
      { name: "non-UUID clientId", body: payload({ clientId: "not-a-uuid" }) },
    ];
    for (const c of cases) {
      const res = await post(base, c.body);
      assert.equal(res.status, 400, `${c.name} is rejected`);
      const body = (await res.json()) as { error?: unknown };
      assert.equal(typeof body.error, "string", `${c.name} returns an error string`);
      assert.match(body.error as string, /clientId/, `${c.name} error names clientId`);
    }
    assert.equal(count(db, "sessions"), 0, "nothing was written");
  });
});
