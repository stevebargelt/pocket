import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/server/db";
import { seedCorpus, getCorpus } from "../src/server/corpus";

function writeSeed(dir: string, name: string, seed: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(seed) + "\n");
}

function fixtureDir(): string {
  return mkdtempSync(join(tmpdir(), "pocket-seeds-"));
}

function sourcesFor(db: ReturnType<typeof openDb>, context: string): string[] {
  return db
    .prepare("SELECT DISTINCT source FROM corpus_items WHERE context = ? ORDER BY source")
    .all(context)
    .map((r) => (r as { source: string }).source);
}

test("seedCorpus loads the committed prompts seed", () => {
  const db = openDb(":memory:");
  seedCorpus(db); // default real seeds dir
  assert.ok(getCorpus(db, "prompts").length > 0, "prompts corpus is non-empty");
  db.close();
});

test("re-seeding one context does not delete another context's rows", () => {
  const db = openDb(":memory:");

  const dir1 = fixtureDir();
  writeSeed(dir1, "cli.json", { context: "cli", source: "A", license: "MIT", items: ["ls -la", "cd ~"] });
  writeSeed(dir1, "email.json", { context: "email", source: "B", license: "MIT", items: ["thanks, will do", "see attached"] });
  seedCorpus(db, dir1);
  assert.equal(getCorpus(db, "cli").length, 2);
  assert.equal(getCorpus(db, "email").length, 2);

  // Re-seed ONLY cli from a different fixture: email must be untouched.
  const dir2 = fixtureDir();
  writeSeed(dir2, "cli.json", { context: "cli", source: "A2", license: "MIT", items: ["git status"] });
  seedCorpus(db, dir2);

  assert.equal(getCorpus(db, "cli").length, 1, "cli replaced wholesale");
  assert.deepEqual(sourcesFor(db, "cli"), ["A2"], "cli now carries the new source");
  assert.equal(getCorpus(db, "email").length, 2, "email rows survive an unrelated re-seed");
  db.close();
});

test("multiple files sharing a context merge with distinct per-row sources", () => {
  const db = openDb(":memory:");
  const dir = fixtureDir();
  writeSeed(dir, "code-a.json", { context: "code", source: "ProjectA", license: "MIT", items: ["const x = 1;"] });
  writeSeed(dir, "code-b.json", { context: "code", source: "ProjectB", license: "Apache-2.0", items: ["def foo(): pass"] });
  seedCorpus(db, dir);

  assert.equal(getCorpus(db, "code").length, 2, "both files merge into the context");
  assert.deepEqual(sourcesFor(db, "code"), ["ProjectA", "ProjectB"], "each row keeps its file's source");
  db.close();
});
