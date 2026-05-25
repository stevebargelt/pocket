import type {
  HistoryEntry,
  SessionKeyStat,
  SessionPayload,
  SessionRow,
} from "../shared/types";
import { CHARS_PER_WORD, LAYOUT_FINGERPRINT } from "../shared/constants";
import { computeMetrics } from "../shared/metrics";
import { updateAggregatesIncremental, writeSessionKeyStats } from "./aggregate";
import type { Db } from "./db";

const SESSION_COLUMNS = `
  id, started_at AS startedAt, ended_at AS endedAt, context,
  layout_fingerprint AS layoutFingerprint, wpm, awpm AS accurateWpm,
  error_rate AS errorRate, target_words AS targetWords, target_seconds AS targetSeconds
`;

/**
 * Persist a finished session: the sessions row, the entire keystroke buffer
 * (batched), the per-session heat-map stats, and the EMA cache update — all in
 * ONE transaction so the keystroke log and its aggregates can never diverge.
 */
export function saveSession(db: Db, payload: SessionPayload): SessionRow {
  const elapsedMs = payload.endedAt - payload.startedAt;
  const metrics = computeMetrics(payload.keystrokes, elapsedMs);
  const targetWords = Math.round(payload.targetChars / CHARS_PER_WORD);
  const fp = LAYOUT_FINGERPRINT;

  const insertSession = db.prepare(
    `INSERT INTO sessions
       (started_at, ended_at, context, layout_fingerprint, mode, wpm, awpm, error_rate, target_words, target_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertKeystroke = db.prepare(
    `INSERT INTO keystrokes (session_id, idx, ts_ms, expected_key, actual_key, latency_ms, correct)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction((): number => {
    const info = insertSession.run(
      payload.startedAt,
      payload.endedAt,
      "prompts",
      fp,
      payload.mode,
      metrics.wpm,
      metrics.accurateWpm,
      metrics.errorRate,
      targetWords,
      payload.targetSeconds,
    );
    const sessionId = Number(info.lastInsertRowid);

    let ts = 0;
    for (const k of payload.keystrokes) {
      ts += k.latencyMs;
      insertKeystroke.run(
        sessionId,
        k.index,
        ts,
        k.expectedChar,
        k.actualChar,
        k.latencyMs,
        k.correct ? 1 : 0,
      );
    }

    writeSessionKeyStats(db, sessionId, payload.keystrokes, fp);
    updateAggregatesIncremental(db, payload.keystrokes, fp, payload.endedAt);
    return sessionId;
  });

  const id = tx();
  return db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`).get(id) as SessionRow;
}

/**
 * History for the trend chart + heat-map evolution. Reads ONLY pre-aggregated
 * tables (sessions, session_key_stats) — never replays the keystroke log — so it
 * stays O(sessions) and well under the 500ms / 50-session target.
 */
export function getHistory(db: Db, limit = 500): HistoryEntry[] {
  const sessions = db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions ORDER BY started_at ASC LIMIT ?`)
    .all(limit) as SessionRow[];
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);
  const placeholders = ids.map(() => "?").join(",");
  const statRows = db
    .prepare(
      `SELECT session_id AS sessionId, key, mean_latency_ms AS meanLatencyMs,
              error_rate AS errorRate, samples
       FROM session_key_stats WHERE session_id IN (${placeholders})`,
    )
    .all(...ids) as Array<SessionKeyStat & { sessionId: number }>;

  const bySession = new Map<number, SessionKeyStat[]>();
  for (const r of statRows) {
    const { sessionId, ...stat } = r;
    const list = bySession.get(sessionId) ?? [];
    list.push(stat);
    bySession.set(sessionId, list);
  }

  return sessions.map((s) => ({ ...s, keyStats: bySession.get(s.id) ?? [] }));
}
