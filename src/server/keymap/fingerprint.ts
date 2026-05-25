// Layout fingerprint: a SHA-256 over a CANONICAL, metadata-free projection of a
// parsed keymap. Every session/stat is stamped with this so each result is
// attributable to the exact layout that produced it (PRD §6/§9).
//
// The projection is layer names + ordered normalised bindings ONLY. It excludes
// source_path, parsed_at, the derived glyph/char fields (which are pure functions
// of the raw binding) and behavior timing (tapping-term, tap-dance, macros). Two
// layouts identical in bindings but differing only in timing therefore collide —
// accepted and documented (architect decision: fingerprint scope = bindings +
// layer names only).

import { createHash } from "node:crypto";
import type { Keymap } from "./types";

/** Stable, byte-identical-across-reparses content hash of a parsed keymap. */
export function fingerprintKeymap(keymap: Keymap): string {
  const projection = keymap.layers.map((layer) => ({
    name: layer.name,
    bindings: layer.bindings.map((b) => b.raw),
  }));
  const canonical = JSON.stringify(projection);
  return createHash("sha256").update(canonical).digest("hex");
}
