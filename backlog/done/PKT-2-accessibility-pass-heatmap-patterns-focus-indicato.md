---
id: PKT-2
type: story
status: done
title: "Accessibility pass: heatmap patterns, focus indicators, chart aria, form semantics"
---

**Closed:** 2026-05-25.

Surfaced by red-frontend on Pocket v1 build. Out of scope for single-user v1 MVP but worth a coordinated a11y pass before any public-facing version:

1. HeatMap uses color-only signaling. Add patterns/text overlay for color-blind users.
2. No visible custom focus indicators on interactive elements. Add focus-visible styles.
3. TrendChart (Recharts) has no accessible name/description. Add aria-label + sr-only summary.
4. Settings form controls not wrapped in semantic <form>. Wrap and add labels.

Source: red-frontend verdict on Pocket v1 build (task-build-4c7211).