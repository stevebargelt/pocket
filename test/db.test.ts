import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/server/db";
import { LAYOUT_FINGERPRINT } from "../src/shared/constants";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

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

test("fresh DB applies 001+002+003 and creates all expected tables", () => {
  const db = openDb(":memory:");
  assert.equal(db.pragma("user_version", { simple: true }), 3);
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

  const db2 = openDb(path); // must not re-run 001/002/003 (would error on CREATE TABLE)
  assert.equal(db2.pragma("user_version", { simple: true }), 3);
  const count = db2.prepare("SELECT COUNT(*) AS n FROM corpus_items").get() as { n: number };
  assert.equal(count.n, 1, "data survives re-open; schema not recreated");
  db2.close();
});

/** Build a pre-003 (user_version 2) DB by applying only 001 + 002 by hand. */
function openV2Db(path: string): Database.Database {
  const db = new Database(path);
  db.exec(readFileSync(join(MIGRATIONS_DIR, "001_init.sql"), "utf8"));
  db.exec(readFileSync(join(MIGRATIONS_DIR, "002_layouts.sql"), "utf8"));
  db.pragma("user_version = 2");
  return db;
}

function statColumns(db: ReturnType<typeof openDb>, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
}

test("003 renames speed_ema -> latency_ms_ema on both stat tables, bumps user_version to 3", () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-db-"));
  const path = join(dir, "pocket.db");

  // Seed a pre-migration v2 DB carrying data under the OLD column name.
  const v2 = openV2Db(path);
  v2.prepare(
    "INSERT INTO key_stats (key, layout_fingerprint, speed_ema, error_rate_ema, samples, last_updated) VALUES (?,?,?,?,?,?)",
  ).run("a", LAYOUT_FINGERPRINT, 123.5, 0.1, 42, 0);
  v2.prepare(
    "INSERT INTO bigram_stats (bigram, layout_fingerprint, speed_ema, error_rate_ema, samples, last_updated) VALUES (?,?,?,?,?,?)",
  ).run("th", LAYOUT_FINGERPRINT, 200, 0.2, 20, 0);
  assert.equal(v2.pragma("user_version", { simple: true }), 2);
  v2.close();

  // Re-open through the real runner: it applies only 003 (3 > current 2).
  const db = openDb(path);
  assert.equal(db.pragma("user_version", { simple: true }), 3);

  for (const t of ["key_stats", "bigram_stats"]) {
    const cols = statColumns(db, t);
    assert.ok(cols.includes("latency_ms_ema"), `${t} has latency_ms_ema after 003`);
    assert.ok(!cols.includes("speed_ema"), `${t} no longer has speed_ema after 003`);
  }

  // RENAME COLUMN is lossless: the user's prior values survive intact.
  const k = db
    .prepare("SELECT latency_ms_ema, error_rate_ema, samples FROM key_stats WHERE key = 'a'")
    .get() as { latency_ms_ema: number; error_rate_ema: number; samples: number };
  assert.equal(k.latency_ms_ema, 123.5);
  assert.equal(k.error_rate_ema, 0.1);
  assert.equal(k.samples, 42);

  const b = db
    .prepare("SELECT latency_ms_ema, samples FROM bigram_stats WHERE bigram = 'th'")
    .get() as { latency_ms_ema: number; samples: number };
  assert.equal(b.latency_ms_ema, 200);
  assert.equal(b.samples, 20);

  db.close();
});
