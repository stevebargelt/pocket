# Pocket — Backlog

## Notes for next session
**Last session ended 2026-05-25.** Pocket v1.2.1 + logo committed and pushed to https://github.com/stevebargelt/pocket. 106/106 tests passing. Active server is local-only at http://localhost:3000.

**Where to pick up:**
- **v1.3 — shortcut drill mode** is the user's stated next interest. CMD-C/V/A/X/Z/S, CTRL-C/B, Backspace, Delete. Must be its own context value (extend CONTEXTS enum with 'shortcuts'). Browser-observable via keydown+modifier state, NOT browser-eaten ones (CMD-W/T/Q/R/N skip). House style is hand-rolled validation; same for the new shortcut-capture mode.
- **v2 — longitudinal layout A/B** is the other roadmap item. Needs accumulated multi-layout data, so most useful after the user has used a non-factory keymap for a while.

**Backlog status (run `forge backlog list --status Active`):**
- #1 backend hardening, #3 security headers, #9 a11y deepening, #10 per-language code splits.
- All are deliberately deferred — user's stance is solo-user-on-localhost doesn't pay for production hygiene yet.
- Closed by recent commits: #4 #5 #6 #7 #8 (in v1.2.1 + v1.2 commits). #2 just closed (subsumed by #9).

**Known forge quirk:** gate-rationale propagation is unreliable. Use `forge invoke engineer` for scope-critical follow-ups instead of relying on advance/request-changes rationale reaching the next phase. See memory `reference_forge_propagation_quirk.md`.

**No in-flight forge runs.** `forge status --json` should show no active runs for this workspace.

## Active

### #1 — Backend hardening: idempotency + error handling + keystrokes streaming
Surfaced by red-backend on Pocket v1 build (task-build-4c7211). Single-user local v1 doesn't need these to ship, but worth addressing once v1 is dogfooded:

1. POST /api/session lacks idempotency. A double-clicked save creates duplicate session rows. Fix: client-generated session UUID, server upserts on it; or POST returns the session id and client guards on it.
2. Route handlers lack explicit try/catch and error responses; exceptions bubble unhandled. Add Express error middleware + per-route catch.
3. readOrderedKeystrokes() loads the whole keystroke table into memory via .all(). Fine for v1 (zero data) but switch to .iterate() or paginated reads once data accumulates.

Source: red-backend verdict on Pocket v1 build.


### #3 — Security hardening: Express headers + SQL interpolation review
Surfaced by red-security on Pocket v1 build. All low-severity for a localhost-only single-user app; revisit if Pocket ever gets a networked deployment:

1. Missing Express security headers. Add helmet middleware (CSP, X-Frame-Options, etc.).
2. SQL PRAGMA statement uses string interpolation. Argument is a known constant (user_version), not user input — safe but cleaner with a constant binding.
3. Dynamic SQL table/column names in weakness.ts and aggregate.ts use string interpolation. Verify all interpolated names come from internal constants (LAYOUT_FINGERPRINT etc.), not user input. If safe, document; if not, use safer construction.

Source: red-security verdict on Pocket v1 build (task-build-4c7211).


### #9 — A11y deepening: semantic structure + heatmap text/pattern overlay + nav labels
Surfaced by red-frontend on Pocket v1 build duplicate task-build-fc5272. More concrete than backlog #2; merge or address together when doing the a11y pass:

1. HeatMap relies on color-only signaling — add text labels + patterns (already in #2, restating with emphasis).
2. Arrow navigation buttons in HistoryView have no aria-labels (heat-map evolution stepper).
3. SettingsView form controls lack htmlFor linking between <label> and inputs.
4. HeatMap metric toggle buttons (speed/errors) lack accessible labels.
5. App 'Pocket' branding is a <span>, not a heading; header lacks semantic <header>/<nav> landmarks.
6. NavButton lacks aria-current='page' on active nav state.
7. HeatMap SVG text colors not verified for WCAG contrast.
8. HistoryView session pagination keyboard-inaccessible.
9. TypingSurface array-index keys on character spans (minor React perf; might cause flicker on text changes).
10. useKeystrokeCapture uses state 'bump' to force re-renders — minor pattern smell, works correctly.

Subsumes and extends ticket #2. Source: red-frontend verdict on task-build-fc5272.


### #10 — Pocket — programming context (deferred from v1.1)
v1.1 originally scoped 5 contexts (prompts + CLI + code + email + Teams) but user opted to defer programming. Add as a follow-on pipeline run after v1.1 and v1.2 ship.

Open design decision when this runs:
- Per-language context values (typescript / python / bash as distinct contexts, UI groups them) vs flat 'code' bucket. Architect recommended per-language for v1.1; revisit then.

Corpus considerations:
- Use permissive-license sources only (Express, FastAPI, etc.). Avoid The Stack at runtime.
- Per-language line cap (~120 chars for code vs 200 for prose).
- Curate-script analogous to scripts/curate-corpus.ts.

This is NOT a v1.x hardening item — it's a real feature, just deferred.


## Done (recent)

### #2 — Accessibility pass: heatmap patterns, focus indicators, chart aria, form semantics
**Closed:** 2026-05-25.

Surfaced by red-frontend on Pocket v1 build. Out of scope for single-user v1 MVP but worth a coordinated a11y pass before any public-facing version:

1. HeatMap uses color-only signaling. Add patterns/text overlay for color-blind users.
2. No visible custom focus indicators on interactive elements. Add focus-visible styles.
3. TrendChart (Recharts) has no accessible name/description. Add aria-label + sr-only summary.
4. Settings form controls not wrapped in semantic <form>. Wrap and add labels.

Source: red-frontend verdict on Pocket v1 build (task-build-4c7211).


### #5 — v1.2 dependency: HeatMap currently hardcodes QWERTY layout
**Closed:** 2026-05-25.

HeatMap.tsx renders a hardcoded QWERTY keyboard SVG. When v1.2 lands (ZMK keymap reader), the heat map should render the user's actual layout from the parsed keymap. Track this dependency so v1.2 includes the HeatMap refactor as part of its scope.

Source: red-wide verdict on Pocket v1 build (task-build-4c7211).


### #8 — SessionPayload validation: time bounds + keystroke content
**Closed:** 2026-05-25.

Surfaced by red-backend (medium) and red-security (medium) on Pocket v1 build re-run (task-build-776a99). POST /api/session currently accepts session payloads with weak validation of time fields and keystroke content. Risk: bad data can pollute longitudinal trends (which are core to the product value, PRD Goal 3) and metric calculations.

Add zod schema or hand-rolled validator covering:
- started_at/ended_at as ISO timestamps, ended_at >= started_at, duration sanity-capped (e.g. <2 hours)
- keystroke[].latency_ms non-negative, sanity-capped (e.g. <10000)
- keystroke[].expected/actual character length checks
- Reject payloads that don't pass; return 400 with a clear error.

Related to ticket #4 (v1 polish: payload validation).

Source: red-backend + red-security verdicts on Pocket v1 build re-run.


### #7 — Naming: 'speedEma' field actually holds latency-ms, not speed
**Closed:** 2026-05-25.

Surfaced by red-wide on Pocket v1 build re-run (task-build-776a99, medium). The EMA tracks mean inter-keystroke latency in milliseconds, but the field/variable name is 'speedEma'. Lower values = faster. Rename to 'latencyMsEma' (or similar) across shared types, db schema, server folds, and client consumers to prevent future readers from inverting the metric.

Source: red-wide verdict on Pocket v1 build re-run.


### #6 — Light theme is half-broken: only body styles, surfaces stay dark
**Closed:** 2026-05-25.

Settings exposes a dark/light theme toggle (App.tsx + settings.ts:applyTheme). The CSS override at src/client/styles/index.css:23-30 only retargets body background/text. All surface/border/muted Tailwind classes (bg-ink-surface, text-ink-muted, border-ink-border) keep dark palette values regardless of data-theme. Light mode therefore yields a light body with dark cards — visually broken.

Resolve by either:
(a) Remove the light option from Settings + Theme type + applyTheme. PRD only requires 'dark default'. Simplest.
(b) Wire full Tailwind theme variants (or CSS custom properties) so the ink palette responds to data-theme=light.

Source: red-frontend verdict on Pocket v1 build (task-build-4c7211). Confirmed by orchestrator code review on re-run task-build-776a99.


### #4 — v1 polish: EMA first-keystroke bias, payload validation, README cleanup
**Closed:** 2026-05-25.

Surfaced by red-wide on Pocket v1 build. Low priority polish:

1. EMA seeding bias: first keystroke per key initializes the EMA with itself, weighting early samples disproportionately. Consider a warmup period (require 3-5 samples before EMA is 'live') or alternate seeding.
2. POST /api/session payload validation is permissive. Add a zod-style schema check on incoming session payloads.
3. README documentation inconsistencies with actual server behavior (e.g. ports, scripts). Audit and align.

Source: red-wide verdict on Pocket v1 build (task-build-4c7211).

