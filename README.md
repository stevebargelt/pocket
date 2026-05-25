# Pocket

<img width="120" src="docs/design/pocket-logo.svg" alt="Pocket" />

*Break in your Glove 80.*

A single-user, local-first typing tutor for the [MoErgo Glove 80](https://www.moergo.com/).
This is **v1.2 (ZMK keymap awareness)**: practice across prompts, CLI, code,
email, and Teams chat, with per-context history and a cross-context summary, plus
a live Glove 80 keymap display and layer/thumb-cluster drills read from your
actual ZMK keymap — on top of the v1 weakness engine and longitudinal history.
Everything runs locally; no accounts, no cloud, no telemetry.

> Scope is PRD §5 through "v1.2 — ZMK keymap awareness" (the keymap reader,
> layer/thumb drills, and per-layout fingerprint all ship here). The longitudinal
> layout A/B view (v2) is still out of scope.

## Quick start

```bash
npm install
npm run seed     # one-time: load the built-in corpus into SQLite
npm start        # builds the client, then serves app + API on http://localhost:3000
```

Then open <http://localhost:3000>.

### Development

```bash
npm run dev      # Vite dev server (5173) + Express API (3000) with hot reload
```

In dev, the Vite server proxies `/api/*` to the Express server.

### Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server (5173) + Express API (3000) with hot reload |
| `npm start` | `vite build` then start Express serving `dist/` + the JSON API |
| `npm run build` | Build the client bundle into `dist/` |
| `npm run serve` | Start Express only (expects `dist/` already built) |
| `npm run seed` | Load every `data/seeds/*.json` corpus into the `corpus_items` table (idempotent per context) |
| `npm run curate` | Regenerate the prompts seed from a local WildChat-1M dump (see CREDITS) |
| `npm run curate:cli` | Regenerate the CLI seed from a local tldr-pages checkout (see PROVENANCE) |
| `npm run curate:code` | Regenerate the code seeds from local OSS checkouts (see PROVENANCE) |
| `npm test` | Run the unit + e2e test suite |
| `npm run typecheck` | `tsc --noEmit` |

## What v1 does

- **Practice mode** — pick a context (v1.1, below) then practice. The original v1
  context is *prompts*: a small built-in seed of clean, single-turn human prompts
  (≤200 chars) inspired by WildChat-1M.
- **Typing surface** — Monkeytype-style minimal flow: current character
  highlighted, errors marked inline, no popups, no animation, dark theme.
- **Weakness engine** — every keystroke is logged; per-key and per-bigram
  recency-weighted (EMA) speed and error stats are maintained.
- **Targeted generator** — "practice my weak spots" prefers corpus lines that
  contain your worst-performing bigrams.
- **Session results** — raw WPM, accurate WPM, error rate, and a per-key heat map.
- **History** — trend chart (WPM / accuracy / error rate over time) and per-key
  heat-map evolution.
- **Recommender (heuristic)** — on session start, suggests today's weak set (top
  5) and a 10-minute target, and tells you *why*. Clearly labeled a heuristic;
  you can ignore it.

## What v1.1 adds — the five-context corpus router

- **Five contexts** — practice text now comes from one of five curated corpora:
  **prompts | CLI | code | email | teams**. CLI is short, symbol-rich command
  examples (tldr-pages, CC-BY-4.0); code mixes TypeScript, Python, and Bash
  samples from permissive-license OSS; email is a PII-scrubbed, hand-reviewed
  Enron seed; teams is a hand-curated set of short workplace-chat snippets. See
  `CREDITS.md` and `data/PROVENANCE.md` for per-source attribution and the email
  scrubbing rules. All corpora are curated at build time and committed — nothing
  is fetched at runtime.
- **Context picker** — a small segmented control on the Practice landing lets you
  choose the context; it's hidden once typing starts. Your choice is remembered
  (localStorage) so you return to your last context. Default is *prompts*.
- **Per-context history** — every session is tagged with its context. The History
  view has a context filter (all, or one context) that narrows the trend chart
  and heat-map evolution.
- **Cross-context summary** — a quiet supplement on History showing per-context
  WPM/accuracy and an honest rolling-30-day delta (e.g. "you're 12% faster on
  prompts this month, flat on CLI"). A context with too few sessions in either
  window is flagged **not enough data yet** rather than fabricating a trend.

The weakness engine and metric contract are unchanged from v1: per-key/bigram
stats stay **global** across contexts (the cross-context summary is built from
session-level aggregates only), so targeted mode can degrade to random sampling
in symbol-heavy contexts (CLI/code) where your global weak bigrams aren't present.

## What v1.2 adds — ZMK keymap awareness

- **Keymap reader** — Pocket parses a ZMK `.keymap` from a local path
  (`POCKET_KEYMAP_PATH`, or the newest `*.keymap` in `keymaps/`) and watches the
  directory, reloading on re-export. With no keymap present it still runs and
  falls back to the per-key heat map.
- **Live keymap display** — a Glove 80 SVG (`src/client/components/KeymapView.tsx`)
  rendered from the parsed ZMK source, showing the selected layer with Mac mod
  glyphs (⌘ ⌥ ⌃ ⇧).
- **Layer & thumb-cluster drills** — a layer picker on the Practice landing
  generates scored practice for each drillable non-base layer and for the thumb
  cluster (the documented #1 Glove 80 pain point). Non-drillable layers stay
  viewable but aren't turned into drills.
- **Layout fingerprint** — every session and stat is stamped with a SHA-256 of
  the parsed keymap (bindings + layer names), so results are attributable to the
  exact layout and a mid-stream layout change never silently pollutes a comparison.

## How the numbers work (the metric contract)

Defined once in `src/shared/metrics.ts` and shared by the live UI, the save path,
and history — so every trend is commensurable.

- **Raw WPM** = (all typed characters / 5) / minutes.
- **Accurate (net) WPM** = (final correct characters / 5) / minutes.
- **Error rate** — Monkeytype-style: any position ever typed wrong counts as an
  error for accuracy/error-rate, *even if corrected*. Corrections fix net WPM,
  not the error count.

## The weakness engine

- **EMA fold** (`src/server/ema.ts`): `ema' = α·sample + (1−α)·ema`, applied per
  sample in keystroke timestamp order. `EMA_ALPHA = 0.2`. Recency-weighted by
  construction; the same pure fold powers both the incremental write path and a
  full rebuild from the keystroke log — so the derived stats never drift.
- **EMA warmup** (`WARMUP_SAMPLES = 3` in `src/shared/constants.ts`): a single
  early sample shouldn't masquerade as a stable EMA, so until a unit has
  accumulated `WARMUP_SAMPLES` samples its stat reports a simple running mean; at
  and beyond the threshold it reads as the live recency-weighted EMA. The
  warmup→live transition is a pure function of the stored sample count, so the
  incremental write path and a from-scratch rebuild still agree across the
  boundary (the no-drift invariant holds). This is a tunable correctness fix;
  because the eligibility gates below already keep sub-threshold units out of
  recommender output, the user-visible impact is minimal.
- **Key / bigram unit** (`src/shared/bigrams.ts`): stats are keyed on the
  **expected** character (case-sensitive; space is a literal key). A bigram is
  two consecutive expected characters. The generator's substring match uses the
  same definition, so selection and extraction always agree.
- **Eligibility gates** (`src/shared/constants.ts`): a key needs
  `MIN_KEY_SAMPLES = 30` and a bigram `MIN_BIGRAM_SAMPLES = 15` samples before it
  can be ranked "weakest". Below threshold, targeted generation falls back to
  random sampling and the recommender shows a transparent "not enough data yet"
  state instead of a claim.
- **Weakest ranking**: composite of relative slowness (vs your own per-key mean)
  and error rate; top `TOP_N_WEAK = 5` surface in the recommendation.

## Data model

SQLite file on disk (`pocket.db`, gitignored). Schema lives in `migrations/`,
applied forward-only via `PRAGMA user_version`.

- `sessions` — one row per practice session (WPM, accurate WPM, error rate,
  `context`, …). The `context` column predates v1.1; v1.1 populates it per session.
- `keystrokes` — every keystroke (expected, actual, latency, correct). The
  source of truth; aggregates are rebuildable from it and never dropped.
- `key_stats`, `bigram_stats` — the EMA cache used by the weakness engine and
  recommender (derived; safe to rebuild).
- `session_key_stats` — per-session per-key aggregate; the time series the
  heat-map-evolution view reads (history reads never replay keystrokes).
- `corpus_items` — practice text with `context`, `source`, and `license`. Seeded
  from `data/seeds/*.json` (one or more files per context); re-seeding is
  idempotent per context. No schema change was needed for v1.1.
- `layouts` — one row per parsed keymap (v1.2), keyed on its content fingerprint.
  Stores the canonical layer/binding JSON used to render the live keymap display;
  re-exporting an identical layout upserts the same row rather than minting a new
  one.

Every row is stamped with a `layout_fingerprint`. With no keymap loaded this is
the sentinel `LAYOUT_FINGERPRINT = "v1-unknown-layout"`; once v1.2's keymap
reader has parsed a `.keymap`, the fingerprint is a SHA-256 over the canonical
parsed bindings + layer names (`src/server/keymap/fingerprint.ts`), so every
result is attributable to the exact layout that produced it and pre-keymap data
stays cleanly segregated.

## Performance targets

- Keystroke logging adds no perceptible input lag (no synchronous or network I/O
  on the keydown path; the buffer is in-memory, persisted once at session end in
  a single transaction).
- History view renders in <500 ms for ~50 sessions (reads only pre-aggregated
  tables, never the keystroke log).

## License & credits

MIT (see `LICENSE`). Inspirations and per-source corpus attribution are in
`CREDITS.md`, with provenance and the email PII-scrubbing rules in
`data/PROVENANCE.md` (Keybr for algorithmic inspiration, Monkeytype for UX;
corpora from WildChat, tldr-pages, permissive-license OSS, the Enron corpus, and
a hand-curated Teams set; MoErgo for context).
