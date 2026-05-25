import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/server/db";

const EXPECTED_TABLES = [
  "sessions",
  "keystrokes",
  "key_stats",
  "bigram_stats",
  "session_key_stats",
  "corpus_items",
];

function tables(db: ReturnType<typeof openDb>): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => (r as { name: string }).name);
}

test("fresh DB applies 001 and creates all six tables", () => {
  const db = openDb(":memory:");
  assert.equal(db.pragma("user_version", { simple: true }), 1);
  const present = tables(db);
  for (const t of EXPECTED_TABLES) {
    assert.ok(present.includes(t), `missing table ${t}`);
  }
  db.close();
});

test("re-opening a DB file is idempotent (migrations gated by user_version)", () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-db-"));
  const path = join(dir, "pocket.db");

  const db1 = openDb(path);
  db1.prepare(
    "INSERT INTO corpus_items (context, text, source, license) VALUES (?,?,?,?)",
  ).run("prompts", "hello world", "test", "MIT");
  db1.close();

  const db2 = openDb(path); // must not re-run 001 (would error on CREATE TABLE)
  assert.equal(db2.pragma("user_version", { simple: true }), 1);
  const count = db2.prepare("SELECT COUNT(*) AS n FROM corpus_items").get() as { n: number };
  assert.equal(count.n, 1, "data survives re-open; schema not recreated");
  db2.close();
});
