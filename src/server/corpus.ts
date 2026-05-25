import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db";

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/corpus-seed.json");

interface Seed {
  context: string;
  source: string;
  license: string;
  items: string[];
}

export interface CorpusItem {
  id: number;
  text: string;
}

export function readSeed(): Seed {
  return JSON.parse(readFileSync(SEED_PATH, "utf8")) as Seed;
}

/** Load the committed seed into corpus_items. Idempotent per context. */
export function seedCorpus(db: Db): number {
  const seed = readSeed();
  const insert = db.prepare(
    "INSERT INTO corpus_items (context, text, source, license) VALUES (?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM corpus_items WHERE context = ?").run(seed.context);
    for (const text of seed.items) insert.run(seed.context, text, seed.source, seed.license);
  });
  tx();
  return seed.items.length;
}

export function getCorpus(db: Db, context = "prompts"): CorpusItem[] {
  return db
    .prepare("SELECT id, text FROM corpus_items WHERE context = ?")
    .all(context) as CorpusItem[];
}
