---
id: PKT-6
type: story
status: done
title: "Light theme is half-broken: only body styles, surfaces stay dark"
---

**Closed:** 2026-05-25.

Settings exposes a dark/light theme toggle (App.tsx + settings.ts:applyTheme). The CSS override at src/client/styles/index.css:23-30 only retargets body background/text. All surface/border/muted Tailwind classes (bg-ink-surface, text-ink-muted, border-ink-border) keep dark palette values regardless of data-theme. Light mode therefore yields a light body with dark cards — visually broken.

Resolve by either:
(a) Remove the light option from Settings + Theme type + applyTheme. PRD only requires 'dark default'. Simplest.
(b) Wire full Tailwind theme variants (or CSS custom properties) so the ink palette responds to data-theme=light.

Source: red-frontend verdict on Pocket v1 build (task-build-4c7211). Confirmed by orchestrator code review on re-run task-build-776a99.