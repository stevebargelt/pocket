# Pocket

*Break in your Glove 80.*

A single-user, local-first typing tutor for the [MoErgo Glove 80](https://www.moergo.com/).
This is **v1 (MVP)**: prompt practice + a weakness engine + longitudinal history.
Everything runs locally; no accounts, no cloud, no telemetry.

> Scope is strictly PRD §5 "v1 — MVP". The 5-context corpus router (v1.1), ZMK
> keymap reader (v1.2), and longitudinal layout A/B (v2) are out of scope here.

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

### Other scripts

| Script | What it does |
|--------|--------------|
| `npm start` | `vite build` then start Express serving `dist/` + the JSON API |
| `npm run build` | Build the client bundle into `dist/` |
| `npm run serve` | Start Express only (expects `dist/` already built) |
| `npm run seed` | Load `data/corpus-seed.json` into the `corpus_items` table |
| `npm run curate` | Regenerate the seed from a local WildChat-1M dump (see CREDITS) |
| `npm test` | Run the unit + e2e test suite |
| `npm run typecheck` | `tsc --noEmit` |

## What v1 does

- **Practice mode** — prompts context only. Corpus is a small built-in seed of
  clean, single-turn human prompts (≤200 chars) inspired by WildChat-1M.
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

- `sessions` — one row per practice session (WPM, accurate WPM, error rate, …).
- `keystrokes` — every keystroke (expected, actual, latency, correct). The
  source of truth; aggregates are rebuildable from it and never dropped.
- `key_stats`, `bigram_stats` — the EMA cache used by the weakness engine and
  recommender (derived; safe to rebuild).
- `session_key_stats` — per-session per-key aggregate; the time series the
  heat-map-evolution view reads (history reads never replay keystrokes).
- `corpus_items` — practice text with `source` + `license`.

Every row is stamped with a `layout_fingerprint`. In v1 there is no keymap
reader yet, so this is the sentinel `LAYOUT_FINGERPRINT = "v1-unknown-layout"`;
v1.2 will replace it with a hash of the parsed ZMK keymap and can cleanly
segregate this pre-keymap data.

## Performance targets

- Keystroke logging adds no perceptible input lag (no synchronous or network I/O
  on the keydown path; the buffer is in-memory, persisted once at session end in
  a single transaction).
- History view renders in <500 ms for ~50 sessions (reads only pre-aggregated
  tables, never the keystroke log).

## License & credits

MIT (see `LICENSE`). Inspirations and corpus attribution are in `CREDITS.md`
(Keybr for algorithmic inspiration, Monkeytype for UX, WildChat for the corpus,
MoErgo for context).
