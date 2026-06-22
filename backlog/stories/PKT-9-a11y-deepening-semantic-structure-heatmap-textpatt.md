---
id: PKT-9
type: story
status: active
title: "A11y deepening: semantic structure + heatmap text/pattern overlay + nav labels"
---

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