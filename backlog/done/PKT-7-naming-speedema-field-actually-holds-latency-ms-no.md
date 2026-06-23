---
id: PKT-7
type: story
status: done
title: "Naming: 'speedEma' field actually holds latency-ms, not speed"
---

**Closed:** 2026-05-25.

Surfaced by red-wide on Pocket v1 build re-run (task-build-776a99, medium). The EMA tracks mean inter-keystroke latency in milliseconds, but the field/variable name is 'speedEma'. Lower values = faster. Rename to 'latencyMsEma' (or similar) across shared types, db schema, server folds, and client consumers to prevent future readers from inverting the metric.

Source: red-wide verdict on Pocket v1 build re-run.