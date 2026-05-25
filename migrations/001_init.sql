-- Pocket v1 schema (PRD §7) + session_key_stats for heat-map evolution.
-- Forward-only. keystrokes is the source of truth and is never dropped;
-- key_stats / bigram_stats / session_key_stats are derived and rebuildable.

CREATE TABLE sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER NOT NULL,
  context         TEXT    NOT NULL,
  layout_fingerprint TEXT NOT NULL,
  mode            TEXT    NOT NULL,
  wpm             REAL    NOT NULL,
  awpm            REAL    NOT NULL,
  error_rate      REAL    NOT NULL,
  target_words    INTEGER NOT NULL,
  target_seconds  INTEGER NOT NULL
);

CREATE TABLE keystrokes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,
  ts_ms        INTEGER NOT NULL,
  expected_key TEXT    NOT NULL,
  actual_key   TEXT    NOT NULL,
  latency_ms   INTEGER NOT NULL,
  correct      INTEGER NOT NULL
);
CREATE INDEX idx_keystrokes_session ON keystrokes(session_id, id);

CREATE TABLE key_stats (
  key                TEXT    NOT NULL,
  layout_fingerprint TEXT    NOT NULL,
  speed_ema          REAL    NOT NULL,
  error_rate_ema     REAL    NOT NULL,
  samples            INTEGER NOT NULL,
  last_updated       INTEGER NOT NULL,
  PRIMARY KEY (key, layout_fingerprint)
);

CREATE TABLE bigram_stats (
  bigram             TEXT    NOT NULL,
  layout_fingerprint TEXT    NOT NULL,
  speed_ema          REAL    NOT NULL,
  error_rate_ema     REAL    NOT NULL,
  samples            INTEGER NOT NULL,
  last_updated       INTEGER NOT NULL,
  PRIMARY KEY (bigram, layout_fingerprint)
);

CREATE TABLE session_key_stats (
  session_id         INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  key                TEXT    NOT NULL,
  layout_fingerprint TEXT    NOT NULL,
  mean_latency_ms    REAL    NOT NULL,
  error_rate         REAL    NOT NULL,
  samples            INTEGER NOT NULL,
  PRIMARY KEY (session_id, key)
);

CREATE TABLE corpus_items (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  context TEXT NOT NULL,
  text    TEXT NOT NULL,
  source  TEXT NOT NULL,
  license TEXT NOT NULL
);
CREATE INDEX idx_corpus_context ON corpus_items(context);
