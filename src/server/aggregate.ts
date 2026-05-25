import type { KeystrokeRecord, SessionKeyStat } from "../shared/types";
import { EMA_ALPHA, LAYOUT_FINGERPRINT } from "../shared/constants";
import { foldKeystrokes, type FoldStat } from "./ema";
import type { Db } from "./db";

// key_stats / bigram_stats are a DERIVED cache: the incremental write path keeps
// them current, and rebuildAggregatesFromKeystrokes() can recompute them from
// the keystroke log. Because both go through the same foldKeystrokes left-fold
// over the same id-ordered stream, the two never drift.

type StatTable = "key_stats" | "bigram_stats";
type UnitCol = "key" | "bigram";

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

function loadFoldMap(db: Db, table: StatTable, unitCol: UnitCol, fp: string): Map<string, FoldStat> {
  const rows = db
    .prepare(
      `SELECT ${unitCol} AS unit, latency_ms_ema, error_rate_ema, samples FROM ${table} WHERE layout_fingerprint = ?`,
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
  table: StatTable,
  unitCol: UnitCol,
  fp: string,
  map: Map<string, FoldStat>,
  now: number,
): void {
  const upsert = db.prepare(
    `INSERT INTO ${table} (${unitCol}, layout_fingerprint, latency_ms_ema, error_rate_ema, samples, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(${unitCol}, layout_fingerprint) DO UPDATE SET
       latency_ms_ema = excluded.latency_ms_ema,
       error_rate_ema = excluded.error_rate_ema,
       samples = excluded.samples,
       last_updated = excluded.last_updated`,
  );
  for (const [unit, s] of map) {
    upsert.run(unit, fp, s.latencyMsEma, s.errorRateEma, s.samples, now);
  }
}

function readOrderedKeystrokes(db: Db): KeystrokeRecord[] {
  const rows = db
    .prepare(
      "SELECT idx, expected_key, actual_key, latency_ms, correct FROM keystrokes ORDER BY id",
    )
    .all() as Array<{
    idx: number;
    expected_key: string;
    actual_key: string;
    latency_ms: number;
    correct: number;
  }>;
  return rows.map((r) => ({
    index: r.idx,
    expectedChar: r.expected_key,
    actualChar: r.actual_key,
    latencyMs: r.latency_ms,
    correct: !!r.correct,
  }));
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
    keys: loadFoldMap(db, "key_stats", "key", fp),
    bigrams: loadFoldMap(db, "bigram_stats", "bigram", fp),
  };
  const folded = foldKeystrokes(keystrokes, EMA_ALPHA, seed);
  writeFoldMap(db, "key_stats", "key", fp, folded.keys, now);
  writeFoldMap(db, "bigram_stats", "bigram", fp, folded.bigrams, now);
}

/** Recompute the EMA cache from scratch from the full keystroke log. */
export function rebuildAggregatesFromKeystrokes(
  db: Db,
  fp: string = LAYOUT_FINGERPRINT,
  now: number = Date.now(),
): void {
  const all = readOrderedKeystrokes(db);
  const folded = foldKeystrokes(all, EMA_ALPHA);
  const rebuild = db.transaction(() => {
    db.prepare("DELETE FROM key_stats WHERE layout_fingerprint = ?").run(fp);
    db.prepare("DELETE FROM bigram_stats WHERE layout_fingerprint = ?").run(fp);
    writeFoldMap(db, "key_stats", "key", fp, folded.keys, now);
    writeFoldMap(db, "bigram_stats", "bigram", fp, folded.bigrams, now);
  });
  rebuild();
}
