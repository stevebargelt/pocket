import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db";
import { saveSession, getHistory } from "../src/server/sessions";
import type { KeystrokeRecord, SessionPayload } from "../src/shared/types";

function bigPayload(nKeystrokes: number, startedAt: number): SessionPayload {
  const keystrokes: KeystrokeRecord[] = [];
  const text = "the quick brown fox jumps over the lazy dog ";
  for (let i = 0; i < nKeystrokes; i++) {
    const c = text[i % text.length];
    const wrong = i % 50 === 0; // occasional error
    keystrokes.push({
      index: i % 60,
      expectedChar: c,
      actualChar: wrong ? "#" : c,
      latencyMs: 90 + (i % 11) * 5,
      correct: !wrong,
    });
  }
  return {
    startedAt,
    endedAt: startedAt + 60_000,
    mode: "random",
    targetSeconds: 60,
    targetChars: 300,
    keystrokes,
  };
}

test("saveSession persists the full keystroke buffer and computes metrics", () => {
  const db = openDb(":memory:");
  const row = saveSession(db, bigPayload(2000, 1_000));

  const count = db
    .prepare("SELECT COUNT(*) AS n FROM keystrokes WHERE session_id = ?")
    .get(row.id) as { n: number };
  assert.equal(count.n, 2000, "all 2000 keystrokes persisted");

  const sessionCount = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
  assert.equal(sessionCount.n, 1);

  assert.ok(row.wpm > 0, "raw WPM computed");
  assert.ok(row.accurateWpm > 0 && row.accurateWpm <= row.wpm);
  assert.ok(row.errorRate > 0 && row.errorRate < 1);
  assert.equal(row.layoutFingerprint, "v1-unknown-layout");
  db.close();
});

test("getHistory for 50 sessions is fast and reads pre-aggregated tables only", () => {
  const db = openDb(":memory:");
  for (let i = 0; i < 50; i++) saveSession(db, bigPayload(40, 1_000 + i * 100_000));

  const start = performance.now();
  const history = getHistory(db);
  const elapsed = performance.now() - start;

  assert.equal(history.length, 50);
  assert.ok(elapsed < 500, `history took ${elapsed.toFixed(1)}ms (budget 500ms)`);

  // Each entry carries its heat-map data sourced from session_key_stats.
  for (const h of history) {
    assert.ok(h.keyStats.length > 0, "session has per-key heat-map stats");
  }
  // Chronological order for the trend chart.
  for (let i = 1; i < history.length; i++) {
    assert.ok(history[i].startedAt >= history[i - 1].startedAt);
  }
  db.close();
});
