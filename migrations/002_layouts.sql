-- Pocket v1.2 schema: parsed-keymap registry (PRD §7, layouts row).
-- Forward-only and strictly additive: this migration only CREATEs the new
-- `layouts` table. It never drops or alters the v1 tables
-- (sessions / keystrokes / key_stats / bigram_stats / session_key_stats /
-- corpus_items); keystrokes remains the v1 source-of-truth invariant.
--
-- Identity is the CONTENT hash of the parsed keymap (fingerprint), NOT the
-- source file: re-exporting an identical layout under a new UUID filename
-- upserts the same row rather than minting a new one. json_blob holds the
-- canonical parsed keymap (layers + bindings) used to render the live display.

CREATE TABLE layouts (
  fingerprint TEXT    PRIMARY KEY,
  source_path TEXT,
  parsed_at   INTEGER NOT NULL,
  layer_count INTEGER NOT NULL,
  json_blob   TEXT    NOT NULL
);
