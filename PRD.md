# Pocket — PRD

*Break in your Glove 80.*

*Single-user, local-first typing tutor for the MoErgo Glove 80.*

**Owner:** Steve · **Status:** Draft v1 · **Date:** 2026-05-24

---

## 1. Problem & Opportunity

Steve owns a Glove 80 (columnar split, ZMK firmware) and wants to (a) get fast on it, (b) compare keymap configurations he experiments with, (c) practice the text patterns he actually types — Claude prompts, CLI, code, email, Teams chat — and (d) see real progress over time without being patronized by gamification or rote drills.

No existing tool covers this intersection. Keybr nails adaptive weak-key drilling but uses pseudo-words and doesn't know your keymap. Monkeytype nails flow UX but doesn't teach. ZSA's `typ.ing` does live-keymap training but only for QMK boards. MoErgo's own training material amounts to "practice 30–60 min/day." The gap is real and specific. (Full landscape: `~/.forge/runs/run-typing-tutor-market-research-2fb457/task-task-a40c57/report.md`.)

## 2. Goals

1. Provide adaptive, weak-key-targeted practice using **real-context corpora** matching how Steve actually types.
2. Read Steve's actual **ZMK keymap** and provide layer/thumb-cluster practice keyed to it.
3. Persist results locally and produce honest, **longitudinal** views — per-key, per-context, per-layout.
4. Recommend practice cadence using a transparent **heuristic** (not ML hand-wave).
5. Feel like flow, not like a game.

## 3. Non-Goals (v1–v2)

- Multi-user / accounts / cloud sync
- Mobile / tablet
- Hardware diagnostics (key chatter, switch testing)
- RSI break enforcement (Steve opted out)
- Leaderboards, XP, badges, streak guilt — explicitly excluded
- Teaching touch-typing from absolute zero (assumes existing QWERTY competence)

## 4. Target User

**Steve.** Single user. macOS. Glove 80, QWERTY base with custom layers he'll iterate on. High typing volume across LLM prompts, terminal, code, email, Teams. Doesn't want to be coddled.

## 5. Scope by Version

### v1 — MVP: Prompt practice + weakness engine

The smallest thing that's useful daily.

- **Practice mode:** single context (Claude/LLM prompts). Corpus seeded from a sampled, locally-stored subset of **WildChat-1M** (human-turn-only, ODC-BY-attributed). Falls back to small built-in seed corpus offline.
- **Typing surface:** Monkeytype-style minimal flow UX. Current word/char highlighted, errors flagged inline, no popups, no ads, no animation noise.
- **Weakness engine:** per-keystroke logging → per-key and per-bigram **recency-weighted** speed & error stats. Inspired by Keybr's confidence model; reimplemented (not forked) to avoid AGPL.
- **Text generator (targeted mode):** mixes corpus sampling with weak-key-weighted line selection — pull lines from corpus that contain your worst bigrams, ranked.
- **Session results:** raw WPM, accurate WPM, error rate, per-key heat map. Stored to SQLite.
- **History view:** trend chart (WPM/accuracy over time), heat map evolution.
- **Practice recommender (heuristic):** "today's weak set: [b, q, `;`, `ng`, `th`]; suggested 10-minute session." Labeled clearly as a heuristic, not science.

### v1.1 — Five-context corpus router

- Add CLI (corpus: `tldr-pages` + `nl2bash`), Programming (corpus: The Stack subset, language-selectable), Email (corpus: Enron, PII-scrubbed), Teams (corpus: LLM-synthesized at build time + small curated seed).
- Context picker on session start. Per-context history tracking.
- Cross-context summary view ("you're 12% faster on prompts this month, flat on CLI").

### v1.2 — ZMK keymap awareness

- **Keymap reader:** parse Steve's `.keymap` file from a configured local path (his fork of `moergo-sc/glove80-zmk-config`). Watch for changes (fs watcher → reload).
- **Live keymap display:** Glove 80 SVG showing base + active layer + held modifiers, with Mac mod glyphs (⌘ ⌥ ⌃ ⇧). Inspired by typ.ing but rendered from ZMK source.
- **Layer drills:** generated practice targeting each non-base layer (symbols, numbers, navigation, function — whatever Steve configures).
- **Thumb-cluster drills:** dedicated practice for thumb keys (documented #1 Glove 80 pain point).
- **Layout fingerprint:** SHA of the parsed keymap is stored with each session — every result is attributable to the exact layout that produced it.

### v2 — Longitudinal layout A/B

- **Layouts panel:** list every layout fingerprint that's accumulated sessions, with WPM/accuracy/error-by-finger over time.
- **Direct comparison view:** pick layout A and layout B, see side-by-side metrics over matched time windows or session counts.
- **Analyzer overlay:** static metrics per layout (SFB %, rolls, hand-balance) using definitions from `oxeylyzer` / `carpalx` / `genkey`. Lets you see whether theoretical predictions matched your real measured performance.

## 6. Functional Requirements

**Practice loop (all versions):**
- Start session → pick context (v1.1+) → optionally pick layer focus (v1.2+) → text presented → user types → real-time WPM/error feedback → session ends on duration or word target → results screen → save to SQLite.

**Persistence:**
- Every keystroke logged (key, expected, actual, latency, timestamp, session_id).
- Sessions store: context, layout_fingerprint, duration, WPM, accurate WPM, error rate, target metrics.
- Per-key and per-bigram aggregates rebuildable from keystroke log.

**Settings:**
- Session length / word count target.
- Theme (dark/light, font size).
- Keymap file path.
- Corpus refresh / re-sample.

**Configurability of recommender:**
- Steve can override the "today's session" suggestion entirely; the recommender is a *suggestion surface*, not a gate.

## 7. Non-Functional Requirements

**Stack:**
- **Frontend:** vanilla TypeScript + Vite, or React if it earns its weight (probably yes for the keymap SVG). Tailwind for layout, no UI framework bloat.
- **Backend:** Node + Express, single local process.
- **DB:** `better-sqlite3` (sync, fast, file-on-disk). Schema migrations via simple SQL files.
- **Run model:** `npm start` → open `http://localhost:<port>`.
- **Distribution:** repo + README; no packaging in v1–v2.

**Data model sketch (v1):**
```
sessions(id, started_at, ended_at, context, layout_fingerprint, wpm, awpm, error_rate, target_words, target_seconds)
keystrokes(id, session_id, ts_ms, expected_key, actual_key, latency_ms, correct)
key_stats(key, layout_fingerprint, speed_ema, error_rate_ema, samples, last_updated)
bigram_stats(bigram, layout_fingerprint, speed_ema, error_rate_ema, samples, last_updated)
layouts(fingerprint, source_path, parsed_at, layer_count, json_blob)  -- v1.2+
corpus_items(id, context, text, source, license)
```

**Performance:**
- Keystroke logging must not introduce perceptible input lag (target: <2ms overhead per keystroke).
- History views render <500ms for 90 days of typical-volume data (~50 sessions).

**Privacy:**
- Everything local. No telemetry. Corpus downloads attributed in `CREDITS.md`.

**Licensing posture:**
- Project license: **MIT**.
- **Do not fork** Keybr (AGPL-3.0) or Monkeytype (GPL-3.0). Reimplement concepts; cite inspiration in `CREDITS.md`.
- Honor per-file licenses for any corpus we ship (The Stack especially). Avoid ShareGPT.

## 8. Success Metrics

- **Behavioral:** Steve practices ≥3 days/week unprompted for 4 consecutive weeks.
- **Skill:** Measurable WPM improvement on weakest bigrams over a 30-day window (the tool measures this itself; it should *show* improvement, not just claim it).
- **Trust:** When the recommender suggests a session, Steve accepts it (or a near variant) ≥50% of the time.
- **Honest negative metric:** If after 60 days no measurable improvement on any tracked metric, the tool admits it and prompts Steve to reassess.

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Recommender feels arbitrary / unconvincing | Show *why*: "your `;` and `b` are 18% slower than your average — drill suggested." Transparent inputs to every suggestion. |
| Corpus feels stale / repetitive | Multiple contexts, refresh-corpus action, weak-key targeting injects variety. |
| ZMK keymap parsing breaks on custom behaviors (tap-dance, hold-tap, macros) | v1.2 parser supports core ZMK + flags unknowns gracefully. Steve's actual keymap is the test set. |
| Over-engineered "AI scheduler" creeps back in | PRD explicitly says heuristic, labeled as such in UI. Resist the temptation. |
| Pseudo-word-style drills feel tedious | v1 deliberately skips pseudo-words; uses real corpus weighted toward weak keys. |
| Steve changes layout mid-comparison and pollutes data | Layout fingerprint on every session → comparisons are always apples-to-apples. |

## 10. Open Questions

1. **Keymap file location** — needs to be configured on first run. Steve doesn't have a fork yet; v1.2 onboarding will include "here's how to fork `moergo-sc/glove80-zmk-config`."
2. **Teams corpus generation** — LLM-synthesized snippets at build time. Which LLM, what prompt template, how many? Defer to v1.1 design.

---

## Phased delivery plan (build order)

| Version | Scope | Ships when |
|--------|-------|-----------|
| v1 | Prompt practice + weakness engine + history | Foundation works |
| v1.1 | 5-context corpus router | After v1 dogfooded |
| v1.2 | ZMK keymap reader + layer/thumb drills | After Steve has a keymap fork |
| v2 | Longitudinal layout A/B view | After enough sessions across ≥2 layouts |

Each version is independently usable. Order is sequencing, not delay.
