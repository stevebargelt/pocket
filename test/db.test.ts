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
  "layouts",
];

function tables(db: ReturnType<typeof openDb>): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => (r as { name: string }).name);
}

test("fresh DB applies 001+002 and creates all expected tables", () => {
  const db = openDb(":memory:");
  assert.equal(db.pragma("user_version", { simple: true }), 2);
  const present = tables(db);
  for (const t of EXPECTED_TABLES) {
    assert.ok(present.includes(t), `missing table ${t}`);
  }
  db.close();
});

test("002 adds a layouts table matching PRD §7 (fingerprint PK, source_path, parsed_at, layer_count, json_blob)", () => {
  const db = openDb(":memory:");
  const cols = db
    .prepare("PRAGMA table_info(layouts)")
    .all()
    .map((c) => c as { name: string; type: string; notnull: number; pk: number });

  const byName = new Map(cols.map((c) => [c.name, c]));
  assert.deepEqual(
    [...byName.keys()].sort(),
    ["fingerprint", "json_blob", "layer_count", "parsed_at", "source_path"],
  );

  // fingerprint is the content-hash primary key (layout identity, not the file).
  assert.equal(byName.get("fingerprint")!.pk, 1);
  assert.equal(byName.get("fingerprint")!.type, "TEXT");

  // parsed_at / layer_count / json_blob are NOT NULL; source_path is nullable.
  assert.equal(byName.get("parsed_at")!.notnull, 1);
  assert.equal(byName.get("layer_count")!.notnull, 1);
  assert.equal(byName.get("json_blob")!.notnull, 1);
  assert.equal(byName.get("source_path")!.notnull, 0);

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

  const db2 = openDb(path); // must not re-run 001/002 (would error on CREATE TABLE)
  assert.equal(db2.pragma("user_version", { simple: true }), 2);
  const count = db2.prepare("SELECT COUNT(*) AS n FROM corpus_items").get() as { n: number };
  assert.equal(count.n, 1, "data survives re-open; schema not recreated");
  db2.close();
});
