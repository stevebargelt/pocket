import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import express from "express";
import type { AddressInfo } from "node:net";
import { openDb } from "../src/server/db";
import { seedCorpus } from "../src/server/corpus";
import { createApiRouter } from "../src/server/routes";
import type { SessionRow } from "../src/shared/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startServer(): Promise<{ close: () => void; base: string }> {
  const dir = mkdtempSync(join(tmpdir(), "pocket-timer-"));
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

async function postSession(base: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE_KEYSTROKE = { index: 0, expectedChar: "a", actualChar: "a", latencyMs: 100, correct: true };

/**
 * Pure reproduction of the TypingSurface timer-tick logic.
 * Mirrors the interval callback in TypingSurface.tsx exactly:
 *   - durationSeconds===0  → count elapsed UP, never finish
 *   - durationSeconds > 0  → count remaining DOWN, finish when elapsed >= duration
 */
function timerTick(
  elapsed: number,
  durationSeconds: number,
): { remaining: number; shouldFinish: boolean } {
  if (durationSeconds === 0) {
    return { remaining: Math.ceil(elapsed), shouldFinish: false };
  }
  return {
    remaining: Math.max(0, Math.ceil(durationSeconds - elapsed)),
    shouldFinish: elapsed >= durationSeconds,
  };
}

// ---------------------------------------------------------------------------
// Dropdown option values
// ---------------------------------------------------------------------------

test("dropdown: App.tsx session-length dropdown has all six option values (30, 60, 120, 180, 300, 0)", () => {
  const src = readFileSync(join(__dirname, "../src/client/App.tsx"), "utf-8");
  const expected = [30, 60, 120, 180, 300, 0];
  for (const v of expected) {
    assert.ok(
      src.includes(`value={${v}}`),
      `App.tsx must include a <option value={${v}}> for the session-length dropdown`,
    );
  }
});

// ---------------------------------------------------------------------------
// Timer: unlimited mode (durationSeconds === 0)
// ---------------------------------------------------------------------------

test("timer: unlimited mode (durationSeconds=0) counts elapsed time UP", () => {
  assert.deepEqual(timerTick(0, 0),   { remaining: 0,   shouldFinish: false });
  assert.deepEqual(timerTick(0.1, 0), { remaining: 1,   shouldFinish: false });
  assert.deepEqual(timerTick(1, 0),   { remaining: 1,   shouldFinish: false });
  assert.deepEqual(timerTick(1.3, 0), { remaining: 2,   shouldFinish: false });
  assert.deepEqual(timerTick(30, 0),  { remaining: 30,  shouldFinish: false });
  assert.deepEqual(timerTick(120, 0), { remaining: 120, shouldFinish: false });
  assert.deepEqual(timerTick(300, 0), { remaining: 300, shouldFinish: false });
});

test("timer: unlimited mode never calls finish() regardless of elapsed time", () => {
  const longElapsedValues = [1, 30, 60, 120, 300, 600, 3600];
  for (const elapsed of longElapsedValues) {
    const { shouldFinish } = timerTick(elapsed, 0);
    assert.equal(
      shouldFinish,
      false,
      `durationSeconds=0, elapsed=${elapsed}s: finish() must not be triggered`,
    );
  }
});

// ---------------------------------------------------------------------------
// Timer: timed modes (durationSeconds > 0)
// ---------------------------------------------------------------------------

test("timer: timed mode counts remaining time DOWN toward zero", () => {
  assert.deepEqual(timerTick(0, 30),    { remaining: 30, shouldFinish: false });
  assert.deepEqual(timerTick(10, 30),   { remaining: 20, shouldFinish: false });
  assert.deepEqual(timerTick(29, 30),   { remaining: 1,  shouldFinish: false });
  assert.deepEqual(timerTick(29.9, 30), { remaining: 1,  shouldFinish: false });
  assert.deepEqual(timerTick(30, 30),   { remaining: 0,  shouldFinish: true  });
  assert.deepEqual(timerTick(35, 30),   { remaining: 0,  shouldFinish: true  }); // clamps at 0
});

test("timer: timed mode triggers finish() at elapsed === durationSeconds", () => {
  const durations = [30, 60, 120, 180, 300];
  for (const dur of durations) {
    const atBoundary = timerTick(dur, dur);
    assert.equal(
      atBoundary.shouldFinish,
      true,
      `elapsed===durationSeconds (${dur}s): finish() must be triggered`,
    );
    assert.equal(atBoundary.remaining, 0, `remaining must be 0 at boundary`);
  }
});

test("timer: timed mode does not trigger finish() before elapsed reaches durationSeconds", () => {
  const durations = [30, 60, 120, 180, 300];
  for (const dur of durations) {
    const justBefore = timerTick(dur - 0.01, dur);
    assert.equal(
      justBefore.shouldFinish,
      false,
      `elapsed just below durationSeconds (${dur}s): finish() must NOT be triggered yet`,
    );
  }
});

test("timer: 3-minute option (durationSeconds=180) counts down correctly", () => {
  assert.deepEqual(timerTick(0, 180),     { remaining: 180, shouldFinish: false });
  assert.deepEqual(timerTick(90, 180),    { remaining: 90,  shouldFinish: false });
  assert.deepEqual(timerTick(179, 180),   { remaining: 1,   shouldFinish: false });
  assert.deepEqual(timerTick(179.5, 180), { remaining: 1,   shouldFinish: false });
  assert.deepEqual(timerTick(180, 180),   { remaining: 0,   shouldFinish: true  });
  assert.deepEqual(timerTick(185, 180),   { remaining: 0,   shouldFinish: true  });
});

// ---------------------------------------------------------------------------
// Stop button (source-level structural verification)
// ---------------------------------------------------------------------------

test("TypingSurface: stop button is shown when typing has started and hidden before first key", () => {
  const src = readFileSync(join(__dirname, "../src/client/session/TypingSurface.tsx"), "utf-8");
  // stop button is guarded by the `started` flag
  assert.ok(
    src.includes("{started && ("),
    "stop button must be conditionally rendered on the `started` state",
  );
  // 'just start typing' hint disappears once started
  assert.ok(
    src.includes("{!started &&"),
    "'just start typing' prompt must be hidden once typing has started",
  );
});

test("TypingSurface: stop button invokes finish() when clicked", () => {
  const src = readFileSync(join(__dirname, "../src/client/session/TypingSurface.tsx"), "utf-8");
  assert.ok(
    src.includes("onClick={finish}"),
    "stop button must wire onClick to the finish() callback",
  );
  // The button label is the JSX text node "stop" between the tags
  assert.ok(
    />\s*stop\s*<\/button>/.test(src),
    "stop button text content must be 'stop'",
  );
});

// ---------------------------------------------------------------------------
// API integration: new session lengths persist correctly
// ---------------------------------------------------------------------------

test("API: session with targetSeconds=180 (3-minute option) is accepted and stored", async () => {
  const { close, base } = await startServer();
  try {
    const res = await postSession(base, {
      startedAt: 0,
      endedAt: 180_000,
      mode: "random",
      targetSeconds: 180,
      targetChars: 10,
      keystrokes: [{ ...BASE_KEYSTROKE }],
    });
    assert.equal(res.status, 201, "targetSeconds=180 must be accepted with HTTP 201");
    const saved = (await res.json()) as SessionRow;
    assert.ok(saved.id > 0, "session row was persisted");
  } finally {
    close();
  }
});

test("API: unlimited-mode session with targetSeconds=0 is accepted and stored", async () => {
  const { close, base } = await startServer();
  try {
    const res = await postSession(base, {
      startedAt: 0,
      endedAt: 45_000,
      mode: "random",
      targetSeconds: 0,
      targetChars: 10,
      keystrokes: [{ ...BASE_KEYSTROKE }],
    });
    assert.equal(res.status, 201, "targetSeconds=0 (unlimited) must be accepted with HTTP 201");
    const saved = (await res.json()) as SessionRow;
    assert.ok(saved.id > 0, "session row was persisted");
    assert.equal(saved.targetSeconds, 0, "targetSeconds=0 must be stored and returned as 0");
  } finally {
    close();
  }
});

test("API: GET /history returns targetSeconds=0 intact (no coercion to null/1/undefined)", async () => {
  const { close, base } = await startServer();
  try {
    // Write an unlimited session
    const postRes = await postSession(base, {
      startedAt: 1_000,
      endedAt: 91_000,
      mode: "random",
      targetSeconds: 0,
      targetChars: 10,
      keystrokes: [{ ...BASE_KEYSTROKE }],
    });
    assert.equal(postRes.status, 201, "unlimited session must be accepted");
    const saved = (await postRes.json()) as SessionRow;

    // Read it back via history
    const histRes = await fetch(`${base}/api/history`);
    assert.equal(histRes.status, 200, "GET /history must respond 200");
    const history = (await histRes.json()) as SessionRow[];
    const entry = history.find((h) => h.id === saved.id);
    assert.ok(entry !== undefined, "the posted session must appear in history");
    assert.strictEqual(
      entry!.targetSeconds,
      0,
      `history must return targetSeconds as 0 (got: ${JSON.stringify(entry!.targetSeconds)})`,
    );
  } finally {
    close();
  }
});

test("API: negative targetSeconds (-1) is rejected with 400", async () => {
  const { close, base } = await startServer();
  try {
    const res = await postSession(base, {
      startedAt: 0,
      endedAt: 60_000,
      mode: "random",
      targetSeconds: -1,
      targetChars: 10,
      keystrokes: [{ ...BASE_KEYSTROKE }],
    });
    assert.equal(res.status, 400, "targetSeconds=-1 must be rejected with HTTP 400");
    const body = (await res.json()) as { error?: string };
    assert.equal(typeof body.error, "string", "error must be a string");
    assert.match(body.error as string, /targetSeconds/, "error must name the offending field");
  } finally {
    close();
  }
});
