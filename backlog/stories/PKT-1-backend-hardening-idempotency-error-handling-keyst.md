---
id: PKT-1
type: story
status: active
title: "Backend hardening: idempotency + error handling + keystrokes streaming"
---

Surfaced by red-backend on Pocket v1 build (task-build-4c7211). Single-user local v1 doesn't need these to ship, but worth addressing once v1 is dogfooded:

1. POST /api/session lacks idempotency. A double-clicked save creates duplicate session rows. Fix: client-generated session UUID, server upserts on it; or POST returns the session id and client guards on it.
2. Route handlers lack explicit try/catch and error responses; exceptions bubble unhandled. Add Express error middleware + per-route catch.
3. readOrderedKeystrokes() loads the whole keystroke table into memory via .all(). Fine for v1 (zero data) but switch to .iterate() or paginated reads once data accumulates.

Source: red-backend verdict on Pocket v1 build.