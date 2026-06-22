---
id: PKT-8
type: story
status: done
title: "SessionPayload validation: time bounds + keystroke content"
---

**Closed:** 2026-05-25.

Surfaced by red-backend (medium) and red-security (medium) on Pocket v1 build re-run (task-build-776a99). POST /api/session currently accepts session payloads with weak validation of time fields and keystroke content. Risk: bad data can pollute longitudinal trends (which are core to the product value, PRD Goal 3) and metric calculations.

Add zod schema or hand-rolled validator covering:
- started_at/ended_at as ISO timestamps, ended_at >= started_at, duration sanity-capped (e.g. <2 hours)
- keystroke[].latency_ms non-negative, sanity-capped (e.g. <10000)
- keystroke[].expected/actual character length checks
- Reject payloads that don't pass; return 400 with a clear error.

Related to ticket #4 (v1 polish: payload validation).

Source: red-backend + red-security verdicts on Pocket v1 build re-run.