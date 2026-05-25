// Persistence for the v1.2 `layouts` registry (migration 002 / PRD §7).
//
// A layout's identity is the CONTENT hash of its parsed keymap (the fingerprint),
// never the source file: re-exporting an identical layout under a fresh UUID
// filename upserts the same row rather than minting a new one. `json_blob` carries
// the full parsed keymap (layers + bindings + metadata) used to render the live
// display and to reconstruct a layout the active keymap is no longer pointing at.

import type { Db } from "./db";
import type { Keymap } from "./keymap/types";

/** A row of the `layouts` table, camelCased for the API/consumers. */
export interface LayoutRow {
  fingerprint: string;
  sourcePath: string | null;
  parsedAt: number;
  layerCount: number;
  jsonBlob: string;
}

/**
 * Register (or refresh) a parsed keymap under its content-hash fingerprint.
 * Idempotent by fingerprint: an identical layout re-exported under a new file
 * path updates source_path/parsed_at/json_blob in place instead of duplicating.
 * Single-statement upsert — atomic on its own, no surrounding transaction needed.
 */
export function upsertLayout(db: Db, keymap: Keymap, fingerprint: string): void {
  db.prepare(
    `INSERT INTO layouts (fingerprint, source_path, parsed_at, layer_count, json_blob)
       VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(fingerprint) DO UPDATE SET
       source_path = excluded.source_path,
       parsed_at   = excluded.parsed_at,
       layer_count = excluded.layer_count,
       json_blob   = excluded.json_blob`,
  ).run(
    fingerprint,
    keymap.sourcePath,
    keymap.parsedAt,
    keymap.layers.length,
    JSON.stringify(keymap),
  );
}

/** Read a single registered layout by fingerprint, or null when absent. */
export function getLayout(db: Db, fingerprint: string): LayoutRow | null {
  const row = db
    .prepare(
      `SELECT fingerprint, source_path AS sourcePath, parsed_at AS parsedAt,
              layer_count AS layerCount, json_blob AS jsonBlob
       FROM layouts WHERE fingerprint = ?`,
    )
    .get(fingerprint) as LayoutRow | undefined;
  return row ?? null;
}
