import type { KeystrokeRecord, SessionKeyStat } from "../shared/types";
import { EMA_ALPHA, LAYOUT_FINGERPRINT } from "../shared/constants";
import { foldKeystrokes, type FoldStat } from "./ema";
import type { Db } from "./db";
import { STAT_TABLES, type StatKind } from "./sqlIdentifiers";

// key_stats / bigram_stats are a DERIVED cache: the incremental write path keeps
// them current, and rebuildAggregatesFromKeystrokes() can recompute them from
// the keystroke log. Both are per layout fingerprint and go through the same
// foldKeystrokes left-fold over that layout's id-ordered stream, so the two
// never drift.

/** Per-key aggregate for one session — the heat-map-evolution time point. */
export function computeSessionKeyStats(keystrokes: KeystrokeRecord[]): SessionKeyStat[] {
  const acc = new Map<string, { sum: number; err: number; n: number }>();
  for (const k of keystrokes) {
    const a = acc.get(k.expectedChar) ?? { sum: 0, err: 0, n: 0 };
    a.sum += k.latencyMs;
    a.err += k.correct ? 0 : 1;
    a.n += 1;
    acc.set(k.expectedChar, a);
  }
  return [...acc.entries()].map(([key, a]) => ({
    key,
    meanLatencyMs: a.sum / a.n,
    errorRate: a.err / a.n,
    samples: a.n,
  }));
}

function loadFoldMap(db: Db, kind: StatKind, fp: string): Map<string, FoldStat> {
  const rows = db
    .prepare(
      `SELECT ${STAT_TABLES[kind].unitCol} AS unit, latency_ms_ema, error_rate_ema, samples FROM ${STAT_TABLES[kind].table} WHERE layout_fingerprint = ?`,
    )
    .all(fp) as Array<{ unit: string; latency_ms_ema: number; error_rate_ema: number; samples: number }>;
  const map = new Map<string, FoldStat>();
  for (const r of rows) {
    map.set(r.unit, { latencyMsEma: r.latency_ms_ema, errorRateEma: r.error_rate_ema, samples: r.samples });
  }
  return map;
}

function writeFoldMap(
  db: Db,
  kind: StatKind,
  fp: string,
  map: Map<string, FoldStat>,
  now: number,
): void {
  const upsert = db.prepare(
    `INSERT INTO ${STAT_TABLES[kind].table} (${STAT_TABLES[kind].unitCol}, layout_fingerprint, latency_ms_ema, error_rate_ema, samples, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(${STAT_TABLES[kind].unitCol}, layout_fingerprint) DO UPDATE SET
       latency_ms_ema = excluded.latency_ms_ema,
       error_rate_ema = excluded.error_rate_ema,
       samples = excluded.samples,
       last_updated = excluded.last_updated`,
  );
  for (const [unit, s] of map) {
    upsert.run(unit, fp, s.latencyMsEma, s.errorRateEma, s.samples, now);
  }
}

/**
 * Stream one layout's keystrokes (joined to `sessions.layout_fingerprint`) in
 * id order, one record at a time. Id order is save order, which is the order
 * the incremental write path folded them in. Uses `.iterate()` so only the
 * current row is materialised. While the returned generator is open,
 * better-sqlite3 forbids any other statement on this connection, so callers
 * must consume it fully before writing.
 */
export function* readOrderedKeystrokes(db: Db, fp: string): Generator<KeystrokeRecord> {
  const rows = db
    .prepare(
      `SELECT k.idx, k.expected_key, k.actual_key, k.latency_ms, k.correct
       FROM keystrokes k JOIN sessions s ON s.id = k.session_id
       WHERE s.layout_fingerprint = ?
       ORDER BY k.id`,
    )
    .iterate(fp) as IterableIterator<{
    idx: number;
    expected_key: string;
    actual_key: string;
    latency_ms: number;
    correct: number;
  }>;
  for (const r of rows) {
    yield {
      index: r.idx,
      expectedChar: r.expected_key,
      actualChar: r.actual_key,
      latencyMs: r.latency_ms,
      correct: !!r.correct,
    };
  }
}

/** Write one session_key_stats row per expected key for this session. */
export function writeSessionKeyStats(
  db: Db,
  sessionId: number,
  keystrokes: KeystrokeRecord[],
  fp: string = LAYOUT_FINGERPRINT,
): void {
  const insert = db.prepare(
    `INSERT INTO session_key_stats (session_id, key, layout_fingerprint, mean_latency_ms, error_rate, samples)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const s of computeSessionKeyStats(keystrokes)) {
    insert.run(sessionId, s.key, fp, s.meanLatencyMs, s.errorRate, s.samples);
  }
}

/** Continue the EMA cache with one session's keystrokes (the write path). */
export function updateAggregatesIncremental(
  db: Db,
  keystrokes: KeystrokeRecord[],
  fp: string = LAYOUT_FINGERPRINT,
  now: number = Date.now(),
): void {
  const seed = {
    keys: loadFoldMap(db, "key", fp),
    bigrams: loadFoldMap(db, "bigram", fp),
  };
  const folded = foldKeystrokes(keystrokes, EMA_ALPHA, seed);
  writeFoldMap(db, "key", fp, folded.keys, now);
  writeFoldMap(db, "bigram", fp, folded.bigrams, now);
}

/**
 * Recompute the EMA cache from scratch from the keystroke log, per layout.
 *
 * Each layout fingerprint that has sessions is folded from only its own
 * keystrokes, exactly as the incremental write path does, so rebuild and
 * incremental agree per layout. Every existing key_stats / bigram_stats row is
 * dropped first, so a layout with no remaining keystrokes ends with no stats.
 *
 * Runs in one transaction so the read and the write see one consistent
 * snapshot. Every keystroke stream is folded to completion before any DELETE:
 * better-sqlite3 throws if another statement runs while an iterator is open.
 */
export function rebuildAggregatesFromKeystrokes(db: Db, now: number = Date.now()): void {
  const rebuild = db.transaction(() => {
    const fps = (
      db
        .prepare("SELECT DISTINCT layout_fingerprint AS fp FROM sessions ORDER BY layout_fingerprint")
        .all() as Array<{ fp: string }>
    ).map((r) => r.fp);
    const folded = new Map(fps.map((fp) => [fp, foldKeystrokes(readOrderedKeystrokes(db, fp), EMA_ALPHA)]));
    db.prepare("DELETE FROM key_stats").run();
    db.prepare("DELETE FROM bigram_stats").run();
    for (const [fp, f] of folded) {
      writeFoldMap(db, "key", fp, f.keys, now);
      writeFoldMap(db, "bigram", fp, f.bigrams, now);
    }
  });
  rebuild();
}
