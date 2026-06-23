---
id: PKT-4
type: story
status: done
title: "v1 polish: EMA first-keystroke bias, payload validation, README cleanup"
---

**Closed:** 2026-05-25.

Surfaced by red-wide on Pocket v1 build. Low priority polish:

1. EMA seeding bias: first keystroke per key initializes the EMA with itself, weighting early samples disproportionately. Consider a warmup period (require 3-5 samples before EMA is 'live') or alternate seeding.
2. POST /api/session payload validation is permissive. Add a zod-style schema check on incoming session payloads.
3. README documentation inconsistencies with actual server behavior (e.g. ports, scripts). Audit and align.

Source: red-wide verdict on Pocket v1 build (task-build-4c7211).