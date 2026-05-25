import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/server/db";
import { seedCorpus } from "../src/server/corpus";
import { createApiRouter } from "../src/server/routes";
import { MAX_KEYSTROKE_LATENCY_MS, SESSION_MAX_DURATION_MS } from "../src/shared/constants";
import type { SessionRow } from "../src/shared/types";

function startServer(): Promise<{ close: () => void; base: string }> {
  const dir = mkdtempSync(join(tmpdir(), "pocket-validation-"));
  const db = openDb(join(dir, "pocket.db"));
  seedCorpus(db);
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api", createApiRouter(db));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ close: () => server.close(), base: `http://localhost:${port}` });
    });
  });
}

const VALID_KEYSTROKE = { index: 0, expectedChar: "a", actualChar: "a", latencyMs: 100, correct: true };

/** A well-formed payload as a plain object, so malformed cases can override any
 *  field with an off-type value without fighting the SessionPayload type. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    startedAt: 0,
    endedAt: 60_000,
    mode: "random",
    targetSeconds: 60,
    targetChars: 11,
    keystrokes: [{ ...VALID_KEYSTROKE }],
    ...overrides,
  };
}

function withKeystroke(override: Record<string, unknown>): Record<string, unknown> {
  return payload({ keystrokes: [{ ...VALID_KEYSTROKE, ...override }] });
}

async function postSession(base: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Each case names the field the error message MUST mention, so we prove the
// caller learns WHICH field was bad — not just that something was wrong.
const INVALID_CASES: Array<{ name: string; body: unknown; field: RegExp }> = [
  { name: "negative latencyMs", body: withKeystroke({ latencyMs: -1 }), field: /latencyMs/ },
  {
    name: "latencyMs over cap",
    body: withKeystroke({ latencyMs: MAX_KEYSTROKE_LATENCY_MS + 1 }),
    field: /latencyMs/,
  },
  { name: "non-numeric latencyMs", body: withKeystroke({ latencyMs: "fast" }), field: /latencyMs/ },
  { name: "endedAt before startedAt", body: payload({ startedAt: 1000, endedAt: 500 }), field: /endedAt/ },
  {
    name: "duration over the 2h cap",
    body: payload({ startedAt: 0, endedAt: SESSION_MAX_DURATION_MS + 1 }),
    field: /duration/,
  },
  { name: "expectedChar longer than 4", body: withKeystroke({ expectedChar: "abcde" }), field: /expectedChar/ },
  { name: "actualChar not a string", body: withKeystroke({ actualChar: 7 }), field: /actualChar/ },
  { name: "correct not a boolean", body: withKeystroke({ correct: "yes" }), field: /correct/ },
  { name: "targetChars non-positive", body: payload({ targetChars: 0 }), field: /targetChars/ },
  { name: "targetSeconds non-positive", body: payload({ targetSeconds: -1 }), field: /targetSeconds/ },
  { name: "negative startedAt", body: payload({ startedAt: -5, endedAt: 100 }), field: /startedAt/ },
  { name: "non-integer startedAt", body: payload({ startedAt: 1.5, endedAt: 100 }), field: /startedAt/ },
  { name: "keystrokes not an array", body: payload({ keystrokes: "oops" }), field: /keystrokes/ },
];

test("POST /session rejects malformed payloads with a 400 naming the offending field", async () => {
  const { close, base } = await startServer();
  try {
    assert.ok(INVALID_CASES.length >= 5, "exercise at least 5 distinct failure modes");
    for (const c of INVALID_CASES) {
      const res = await postSession(base, c.body);
      assert.equal(res.status, 400, `${c.name} should be rejected with 400`);
      const body = (await res.json()) as { error?: unknown };
      assert.equal(typeof body.error, "string", `${c.name} should return an error string`);
      assert.match(
        body.error as string,
        c.field,
        `${c.name} error should name the offending field (got: ${String(body.error)})`,
      );
    }
  } finally {
    close();
  }
});

test("POST /session accepts a well-formed payload with 201", async () => {
  const { close, base } = await startServer();
  try {
    const res = await postSession(base, payload());
    assert.equal(res.status, 201);
    const saved = (await res.json()) as SessionRow;
    assert.ok(saved.id > 0, "a row was persisted");
  } finally {
    close();
  }
});

test("POST /session accepts the boundary values (startedAt:0, latency at cap, 4-char chars)", async () => {
  const { close, base } = await startServer();
  try {
    const res = await postSession(
      base,
      withKeystroke({ latencyMs: MAX_KEYSTROKE_LATENCY_MS, expectedChar: "wxyz", actualChar: "wxyz" }),
    );
    assert.equal(res.status, 201, "inclusive bounds are accepted, not rejected");
  } finally {
    close();
  }
});
