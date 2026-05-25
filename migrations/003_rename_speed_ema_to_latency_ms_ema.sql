-- Pocket v1.2.1: rename the misleadingly-named speed_ema column.
-- The value is the EMA of mean inter-keystroke LATENCY in ms (lower = faster),
-- so "speed" reads backwards. Rename to latency_ms_ema on both derived stat
-- tables.
--
-- Forward-only and lossless. ALTER TABLE ... RENAME COLUMN (SQLite >= 3.25,
-- bundled by better-sqlite3 ^11) preserves all existing data by definition —
-- the column's contents are untouched, only its name changes. keystrokes (the
-- source of truth) is not touched; key_stats / bigram_stats remain rebuildable.

ALTER TABLE key_stats    RENAME COLUMN speed_ema TO latency_ms_ema;
ALTER TABLE bigram_stats RENAME COLUMN speed_ema TO latency_ms_ema;
