import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db";

const SEEDS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/seeds");

interface Seed {
  context: string;
  source: string;
  license: string;
  note?: string;
  items: string[];
}

export interface CorpusItem {
  id: number;
  text: string;
}

/**
 * Read every *.json seed file in the directory. Each file seeds one context;
 * several files may share a context (e.g. one file per language under `code`),
 * each carrying its own source/license.
 */
export function readSeeds(seedsDir: string = SEEDS_DIR): Seed[] {
  return readdirSync(seedsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(seedsDir, f), "utf8")) as Seed);
}

/**
 * Load the committed seeds into corpus_items. Idempotent per context: each
 * context present in the seed files is cleared exactly once, then every item
 * from every file of that context is inserted with that file's source/license.
 * Contexts absent from the seed files are left untouched, so seeding one context
 * never disturbs another's rows.
 */
export function seedCorpus(db: Db, seedsDir: string = SEEDS_DIR): number {
  const seeds = readSeeds(seedsDir);
  const byContext = new Map<string, Seed[]>();
  for (const seed of seeds) {
    const group = byContext.get(seed.context);
    if (group) group.push(seed);
    else byContext.set(seed.context, [seed]);
  }

  const del = db.prepare("DELETE FROM corpus_items WHERE context = ?");
  const insert = db.prepare(
    "INSERT INTO corpus_items (context, text, source, license) VALUES (?, ?, ?, ?)",
  );

  let total = 0;
  const tx = db.transaction(() => {
    for (const [context, files] of byContext) {
      del.run(context);
      for (const file of files) {
        for (const text of file.items) {
          insert.run(context, text, file.source, file.license);
          total++;
        }
      }
    }
  });
  tx();
  return total;
}

export function getCorpus(db: Db, context = "prompts"): CorpusItem[] {
  return db
    .prepare("SELECT id, text FROM corpus_items WHERE context = ?")
    .all(context) as CorpusItem[];
}
