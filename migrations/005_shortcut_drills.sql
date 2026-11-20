-- Pocket: shortcut drills (PKT-12).
-- Forward-only and strictly additive: this migration only CREATEs two new
-- tables. It never drops or alters an existing table; keystrokes remains the
-- typing source of truth.
--
-- Drills are kept out of sessions/keystrokes on purpose. Every typing-stats
-- reader (the aggregate rebuild, history, summary, recommender, generator and
-- weakness ranking) reads only those tables, so storing drill attempts
-- separately makes it structurally impossible for a drill to move WPM, the
-- per-key/bigram EMAs or history — no reader needs a mode filter. Drill
-- summaries are computed at read time from shortcut_attempts; there is no
-- cached stats table to keep in sync.
--
-- client_id is the client's UUID for the finished drill: a retried POST carries
-- the same id and the server returns the existing row instead of a duplicate.

CREATE TABLE shortcut_drills (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id          TEXT    NOT NULL UNIQUE,
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER NOT NULL,
  layout_fingerprint TEXT    NOT NULL
);

CREATE TABLE shortcut_attempts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  drill_id       INTEGER NOT NULL REFERENCES shortcut_drills(id) ON DELETE CASCADE,
  idx            INTEGER NOT NULL,
  expected_chord TEXT    NOT NULL,
  actual_chord   TEXT    NOT NULL,
  latency_ms     INTEGER NOT NULL,
  correct        INTEGER NOT NULL
);

CREATE INDEX idx_shortcut_attempts_drill ON shortcut_attempts(drill_id, idx);
