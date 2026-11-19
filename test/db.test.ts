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

test("fresh DB applies 001..004 and creates all expected tables", () => {
  const db = openDb(":memory:");
  assert.equal(db.pragma("user_version", { simple: true }), 4);
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

  const db2 = openDb(path); // must not re-run 001..004 (would error on CREATE TABLE)
  assert.equal(db2.pragma("user_version", { simple: true }), 4);
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

test("003 renames speed_ema -> latency_ms_ema on both stat tables (runner then continues to 004)", () => {
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

  // Re-open through the real runner: it applies 003 and 004 (both > current 2).
  const db = openDb(path);
  assert.equal(db.pragma("user_version", { simple: true }), 4);

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

/** Build a pre-004 (user_version 3) DB by applying 001..003 by hand. */
function openV3Db(path: string): Database.Database {
  const db = openV2Db(path);
  db.exec(readFileSync(join(MIGRATIONS_DIR, "003_rename_speed_ema_to_latency_ms_ema.sql"), "utf8"));
  db.pragma("user_version = 3");
  return db;
}

const INSERT_SESSION_V3 = `INSERT INTO sessions
  (started_at, ended_at, context, layout_fingerprint, mode, wpm, awpm, error_rate, target_words, target_seconds)
  VALUES (?, ?, 'prompts', ?, 'random', 40, 38, 0.05, 10, 60)`;

test("004 adds a nullable sessions.client_id; existing v3 sessions migrate with client_id NULL", () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-db-"));
  const path = join(dir, "pocket.db");

  const v3 = openV3Db(path);
  v3.prepare(INSERT_SESSION_V3).run(0, 60_000, LAYOUT_FINGERPRINT);
  v3.prepare(INSERT_SESSION_V3).run(100_000, 160_000, LAYOUT_FINGERPRINT);
  assert.ok(!statColumns(v3 as ReturnType<typeof openDb>, "sessions").includes("client_id"));
  v3.close();

  const db = openDb(path);
  assert.equal(db.pragma("user_version", { simple: true }), 4);
  assert.ok(statColumns(db, "sessions").includes("client_id"), "sessions has client_id after 004");

  const rows = db.prepare("SELECT id, client_id FROM sessions ORDER BY id").all() as Array<{
    id: number;
    client_id: string | null;
  }>;
  assert.equal(rows.length, 2, "existing sessions survive the migration");
  for (const r of rows) assert.equal(r.client_id, null, `session ${r.id} keeps client_id NULL`);
  db.close();
});

test("004 unique index: duplicate non-null client_id is rejected, multiple NULLs are allowed", () => {
  const db = openDb(":memory:");
  const insert = db.prepare(
    `INSERT INTO sessions
       (started_at, ended_at, context, layout_fingerprint, mode, wpm, awpm, error_rate, target_words, target_seconds, client_id)
     VALUES (0, 60000, 'prompts', ?, 'random', 40, 38, 0.05, 10, 60, ?)`,
  );

  insert.run(LAYOUT_FINGERPRINT, null);
  insert.run(LAYOUT_FINGERPRINT, null);

  const id = "6f1c2b9e-3d4a-4e5f-8a7b-0c1d2e3f4a5b";
  insert.run(LAYOUT_FINGERPRINT, id);
  assert.throws(() => insert.run(LAYOUT_FINGERPRINT, id), /UNIQUE constraint failed: sessions\.client_id/);

  const counts = db
    .prepare("SELECT SUM(client_id IS NULL) AS nulls, SUM(client_id IS NOT NULL) AS ids FROM sessions")
    .get() as { nulls: number; ids: number };
  assert.equal(counts.nulls, 2, "two NULL client_id rows coexist");
  assert.equal(counts.ids, 1, "the duplicate non-null client_id was not inserted");
  db.close();
});
