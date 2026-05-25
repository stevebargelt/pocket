import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, "../../migrations");
const DEFAULT_DB_PATH = resolve(HERE, "../../pocket.db");

export type Db = Database.Database;

/** Forward-only migration runner gated by PRAGMA user_version. */
export function runMigrations(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (version <= current) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const apply = db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    });
    apply();
  }
}

export function openDb(path: string = DEFAULT_DB_PATH): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

let singleton: Db | null = null;

/** Process-wide database handle for the Express server. */
export function getDb(): Db {
  if (!singleton) {
    singleton = openDb(process.env.POCKET_DB ?? DEFAULT_DB_PATH);
  }
  return singleton;
}
