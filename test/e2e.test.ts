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
import type { GeneratedText } from "../src/server/generator";
import { CONTEXTS } from "../src/shared/constants";
import type { HistoryEntry, KeystrokeRecord, Recommendation, SessionRow } from "../src/shared/types";

function startServer(): Promise<{ close: () => void; base: string }> {
  const dir = mkdtempSync(join(tmpdir(), "pocket-e2e-"));
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

test("e2e: start a session, type, save, and see it in history", async () => {
  const { close, base } = await startServer();
  try {
    // 1. start: fetch practice text
    const text = (await (await fetch(`${base}/api/text?mode=random`)).json()) as GeneratedText;
    assert.ok(text.text.length > 0, "got practice text");

    // 2. type: simulate typing the first 40 chars correctly
    const sample = text.text.slice(0, 40);
    const keystrokes: KeystrokeRecord[] = Array.from(sample).map((c, i) => ({
      index: i,
      expectedChar: c,
      actualChar: c,
      latencyMs: 100,
      correct: true,
    }));

    // 3. save
    const saveRes = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startedAt: 0,
        endedAt: 60_000,
        mode: "random",
        targetSeconds: 60,
        targetChars: sample.length,
        keystrokes,
      }),
    });
    assert.equal(saveRes.status, 201);
    const saved = (await saveRes.json()) as SessionRow;
    assert.ok(saved.id > 0);
    assert.ok(saved.wpm > 0 && saved.accurateWpm > 0);

    // 4. history reflects it (read from pre-aggregated tables)
    const history = (await (await fetch(`${base}/api/history`)).json()) as HistoryEntry[];
    assert.equal(history.length, 1);
    assert.equal(history[0].id, saved.id);
    assert.ok(history[0].keyStats.length > 0, "history carries per-key heat-map data");

    // 5. recommender responds and is labeled a heuristic
    const rec = (await (await fetch(`${base}/api/recommendation`)).json()) as Recommendation;
    assert.equal(rec.isHeuristic, true);
  } finally {
    close();
  }
});

test("e2e: every context round-trips text -> save -> history with the right tag", async () => {
  const { close, base } = await startServer();
  try {
    for (const context of CONTEXTS) {
      // start: fetch practice text for this context (corpus must be seeded for each)
      const text = (await (
        await fetch(`${base}/api/text?mode=random&context=${context}`)
      ).json()) as GeneratedText;
      assert.ok(text.text.length > 0, `got practice text for ${context}`);

      // type a few correct keystrokes (CLI lines can be short, so cap to the text length)
      const sample = text.text.slice(0, Math.min(20, text.text.length));
      const keystrokes: KeystrokeRecord[] = Array.from(sample).map((c, i) => ({
        index: i,
        expectedChar: c,
        actualChar: c,
        latencyMs: 100,
        correct: true,
      }));

      // save, tagged with the same context
      const saveRes = await fetch(`${base}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: 0,
          endedAt: 60_000,
          mode: "random",
          context,
          targetSeconds: 60,
          targetChars: sample.length,
          keystrokes,
        }),
      });
      assert.equal(saveRes.status, 201, `session saved for ${context}`);
      const saved = (await saveRes.json()) as SessionRow;
      assert.equal(saved.context, context, `saved row carries ${context}`);
    }

    // history holds exactly one row per context, each tagged correctly
    const history = (await (await fetch(`${base}/api/history`)).json()) as HistoryEntry[];
    assert.equal(history.length, CONTEXTS.length, "one history row per context");
    for (const context of CONTEXTS) {
      assert.ok(
        history.some((h) => h.context === context),
        `history has a row tagged ${context}`,
      );
    }
  } finally {
    close();
  }
});

test("e2e: invalid session payload is rejected", async () => {
  const { close, base } = await startServer();
  try {
    const res = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    assert.equal(res.status, 400);
  } finally {
    close();
  }
});
