import { summarizeAttempts } from "../shared/chords";
import type { ShortcutDrillPayload, ShortcutDrillRow } from "../shared/types";
import type { Db } from "./db";

// Shortcut drills live in their own tables (migration 005) and never touch
// sessions/keystrokes, so no typing-stats reader can see them.

interface DrillRecord {
  id: number;
  startedAt: number;
  endedAt: number;
  layoutFingerprint: string;
}

interface AttemptRecord {
  drillId: number;
  expected: string;
  actual: string;
  latencyMs: number;
  correct: boolean;
}

// Full statements (no interpolation) so nothing here needs a sql-safety allowlist entry.
const SELECT_DRILL_BY_ID = `
  SELECT id, started_at AS startedAt, ended_at AS endedAt, layout_fingerprint AS layoutFingerprint
  FROM shortcut_drills WHERE id = ?`;
const SELECT_ALL_DRILLS = `
  SELECT id, started_at AS startedAt, ended_at AS endedAt, layout_fingerprint AS layoutFingerprint
  FROM shortcut_drills ORDER BY started_at ASC, id ASC`;

function toAttempt(r: {
  drillId: number;
  expected: string;
  actual: string;
  latencyMs: number;
  correct: number;
}): AttemptRecord {
  return { ...r, correct: r.correct === 1 };
}

/**
 * Persist a finished shortcut drill and all its attempts in ONE transaction.
 * `correct` is computed here (actual === expected), never trusted from the
 * client, and latency is stored rounded to whole ms.
 *
 * Idempotent on `payload.clientId`, like upsertSession: the first write wins; a
 * replay returns the existing drill with `created: false` and writes nothing.
 */
export function upsertShortcutDrill(
  db: Db,
  payload: ShortcutDrillPayload,
  fp: string,
): { drill: ShortcutDrillRow; created: boolean } {
  const findByClientId = db.prepare(`SELECT id FROM shortcut_drills WHERE client_id = ?`);
  const insertDrill = db.prepare(
    `INSERT INTO shortcut_drills (client_id, started_at, ended_at, layout_fingerprint)
     VALUES (?, ?, ?, ?)`,
  );
  const insertAttempt = db.prepare(
    `INSERT INTO shortcut_attempts (drill_id, idx, expected_chord, actual_chord, latency_ms, correct)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction((): { id: number; created: boolean } => {
    const existing = findByClientId.get(payload.clientId) as { id: number } | undefined;
    if (existing) return { id: existing.id, created: false };

    const info = insertDrill.run(payload.clientId, payload.startedAt, payload.endedAt, fp);
    const drillId = Number(info.lastInsertRowid);
    for (const a of payload.attempts) {
      insertAttempt.run(
        drillId,
        a.index,
        a.expected,
        a.actual,
        Math.round(a.latencyMs),
        a.actual === a.expected ? 1 : 0,
      );
    }
    return { id: drillId, created: true };
  });

  const { id, created } = tx();
  const drill = db.prepare(SELECT_DRILL_BY_ID).get(id) as DrillRecord;
  const attempts = (
    db
      .prepare(
        `SELECT drill_id AS drillId, expected_chord AS expected, actual_chord AS actual,
                latency_ms AS latencyMs, correct
         FROM shortcut_attempts WHERE drill_id = ? ORDER BY idx, id`,
      )
      .all(id) as Parameters<typeof toAttempt>[0][]
  ).map(toAttempt);
  return { drill: { ...drill, summary: summarizeAttempts(attempts) }, created };
}

/**
 * Every stored drill, oldest first, each with its summary computed at read time.
 * Two queries total: the drills, then every attempt grouped in memory by drill.
 */
export function listShortcutDrills(db: Db): ShortcutDrillRow[] {
  const drills = db.prepare(SELECT_ALL_DRILLS).all() as DrillRecord[];
  if (drills.length === 0) return [];

  const rows = db
    .prepare(
      `SELECT drill_id AS drillId, expected_chord AS expected, actual_chord AS actual,
              latency_ms AS latencyMs, correct
       FROM shortcut_attempts ORDER BY drill_id, idx, id`,
    )
    .all() as Parameters<typeof toAttempt>[0][];

  const byDrill = new Map<number, AttemptRecord[]>();
  for (const r of rows) {
    const list = byDrill.get(r.drillId) ?? [];
    list.push(toAttempt(r));
    byDrill.set(r.drillId, list);
  }
  return drills.map((d) => ({ ...d, summary: summarizeAttempts(byDrill.get(d.id) ?? []) }));
}
