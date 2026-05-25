# Credits & Attributions

Pocket is licensed MIT. It does **not** fork or copy code from the projects
below — it reimplements concepts from scratch and credits the inspiration here.

## Algorithmic inspiration — Keybr

The weakness engine (per-key / per-bigram recency-weighted speed and error
tracking, and weak-key-targeted practice) is **inspired by** [Keybr](https://www.keybr.com/)'s
adaptive learning model. Keybr is licensed **AGPL-3.0**. Pocket does not fork,
copy, or link Keybr code. The EMA fold, weakness ranking, and recommender in
`src/server/` are an independent clean-room reimplementation. See
`src/server/ema.ts` and `src/server/weakness.ts`.

## UX inspiration — Monkeytype

The minimal flow typing surface (current-character highlight, inline error
marking, no popups / no animation, dark theme) is **inspired by**
[Monkeytype](https://monkeytype.com/). Monkeytype is licensed **GPL-3.0**.
Pocket does not fork or copy Monkeytype code. The error-accounting rule
(mistyped-then-corrected still counts as an error for accuracy; net WPM credits
only the final correct text) follows Monkeytype's convention and is defined
once in `src/shared/metrics.ts`.

## Corpus — WildChat-1M

The built-in practice corpus (`data/corpus-seed.json`, loaded into the
`corpus_items` table) is a small, curated set of single-turn human prompts
inspired by and intended to mirror [WildChat-1M](https://huggingface.co/datasets/allenai/WildChat-1M)
(Allen Institute for AI), which is released under **ODC-BY 1.0**.

> Zhao, Wenting et al. "WildChat: 1M ChatGPT Interaction Logs in the Wild." ICLR 2024.

Provenance note for v1: the WildChat-1M raw dump was **not available in this
build environment**, so the shipped `data/corpus-seed.json` is a hand-curated
seed of representative clean, single-turn, English, PII-free prompts ≤200 chars,
honestly labeled `source: "WildChat-1M (curated seed)"`. The build-time
filtering pipeline that samples the real dataset lives in
`scripts/curate-corpus.ts`; point it at a local WildChat dump to regenerate the
seed. Pocket never downloads WildChat at runtime.

ODC-BY 1.0: https://opendatacommons.org/licenses/by/1-0/

## Context — MoErgo Glove 80

Pocket targets the [MoErgo Glove 80](https://www.moergo.com/) (columnar split,
ZMK firmware). MoErgo is the keyboard vendor and context for this project; no
MoErgo code or assets are included in v1.

## Libraries

- [React](https://react.dev/) — MIT
- [Vite](https://vite.dev/) — MIT
- [Express](https://expressjs.com/) — MIT
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — MIT
- [Tailwind CSS](https://tailwindcss.com/) — MIT
- [Recharts](https://recharts.org/) — MIT
