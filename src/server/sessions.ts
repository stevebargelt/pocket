import type {
  HistoryEntry,
  SessionKeyStat,
  SessionPayload,
  SessionRow,
} from "../shared/types";
import { CHARS_PER_WORD, DEFAULT_CONTEXT, LAYOUT_FINGERPRINT } from "../shared/constants";
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
 *
 * Idempotent on `payload.clientId`: when a row with that client_id already
 * exists, it is returned with `created: false` and nothing else is written (no
 * keystrokes, no session_key_stats, no EMA update). The first write wins; a
 * replay with a different body is neither compared nor merged. Without a
 * clientId every call inserts a new session.
 *
 * `fp` is the layout fingerprint stamped on the session and its aggregates. It
 * defaults to the v1 sentinel (`LAYOUT_FINGERPRINT`) so pre-keymap callers and
 * tests stay valid; the route passes the active keymap's content-hash
 * fingerprint when one is loaded, segregating per-layout data cleanly.
 */
export function upsertSession(
  db: Db,
  payload: SessionPayload,
  fp: string = LAYOUT_FINGERPRINT,
): { session: SessionRow; created: boolean } {
  const elapsedMs = payload.endedAt - payload.startedAt;
  const metrics = computeMetrics(payload.keystrokes, elapsedMs);
  const targetWords = Math.round(payload.targetChars / CHARS_PER_WORD);
  const context = payload.context ?? DEFAULT_CONTEXT;
  const clientId = payload.clientId ?? null;

  const findByClientId = db.prepare(`SELECT id FROM sessions WHERE client_id = ?`);
  const insertSession = db.prepare(
    `INSERT INTO sessions
       (started_at, ended_at, context, layout_fingerprint, mode, wpm, awpm, error_rate, target_words, target_seconds, client_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertKeystroke = db.prepare(
    `INSERT INTO keystrokes (session_id, idx, ts_ms, expected_key, actual_key, latency_ms, correct)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction((): { id: number; created: boolean } => {
    if (clientId !== null) {
      const existing = findByClientId.get(clientId) as { id: number } | undefined;
      if (existing) return { id: existing.id, created: false };
    }

    const info = insertSession.run(
      payload.startedAt,
      payload.endedAt,
      context,
      fp,
      payload.mode,
      metrics.wpm,
      metrics.accurateWpm,
      metrics.errorRate,
      targetWords,
      payload.targetSeconds,
      clientId,
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
    return { id: sessionId, created: true };
  });

  const { id, created } = tx();
  const session = db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`)
    .get(id) as SessionRow;
  return { session, created };
}

/** Persist a finished session and return its row (see `upsertSession`). */
export function saveSession(
  db: Db,
  payload: SessionPayload,
  fp: string = LAYOUT_FINGERPRINT,
): SessionRow {
  return upsertSession(db, payload, fp).session;
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
