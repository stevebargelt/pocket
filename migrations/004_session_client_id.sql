-- Pocket: idempotent POST /api/session.
-- The client generates a UUID once per finished session and sends it as
-- clientId. A retried or duplicated save carries the same id, so the server
-- returns the existing row instead of inserting a second session (and counting
-- its keystrokes twice in the EMA aggregates).
--
-- Existing rows keep client_id NULL. The partial unique index only constrains
-- non-NULL ids, so legacy rows and internal saveSession callers without an id
-- are unaffected.

ALTER TABLE sessions ADD COLUMN client_id TEXT;
CREATE UNIQUE INDEX idx_sessions_client_id ON sessions(client_id) WHERE client_id IS NOT NULL;
