---
id: PKT-5
type: story
status: done
title: "v1.2 dependency: HeatMap currently hardcodes QWERTY layout"
---

**Closed:** 2026-05-25.

HeatMap.tsx renders a hardcoded QWERTY keyboard SVG. When v1.2 lands (ZMK keymap reader), the heat map should render the user's actual layout from the parsed keymap. Track this dependency so v1.2 includes the HeatMap refactor as part of its scope.

Source: red-wide verdict on Pocket v1 build (task-build-4c7211).