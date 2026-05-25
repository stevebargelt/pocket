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

## Corpus (prompts context) — WildChat-1M

The built-in practice corpus for the **prompts** context
(`data/seeds/prompts.json`, loaded into the
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

## Corpus (CLI context) — tldr-pages

The **CLI** context corpus ships in two seed files:

- `data/seeds/cli-tldr.json` — short, common command-line examples in the style
  of **[tldr-pages](https://github.com/tldr-pages/tldr)** (the tldr-pages
  contributors), whose page content is licensed **CC-BY-4.0**.

  > tldr-pages content © the tldr-pages contributors, licensed under
  > Creative Commons Attribution 4.0 International
  > ([CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)).
  > Source: https://github.com/tldr-pages/tldr — no changes implied beyond
  > curation/excerpting for typing practice.

  Provenance note: a raw tldr-pages checkout was **not available in this build
  environment**, so the shipped lines are a hand-curated seed in the style of
  tldr-pages, honestly labeled `source: "tldr-pages"`, `license: "CC-BY-4.0"`.
  Regenerate from a local clone with `scripts/curate-cli.ts` (point it at
  `data/tldr-raw/`). Pocket never downloads tldr-pages at runtime.

- `data/seeds/cli-handauthored.json` — original day-to-day developer commands
  (git, docker, npm, kubectl, …), authored for Pocket, **MIT**.

**nl2bash is deliberately NOT bundled.** The PRD names
[nl2bash](https://github.com/TellinaTool/nl2bash) as a CLI source, but its data
is released for **research / non-commercial** use, which conflicts with shipping
it inside this MIT repo. No nl2bash data files are included. See
`data/PROVENANCE.md`.

## Corpus (code context) — Express / FastAPI / Bash samples

The **code** context corpus is curated, permissively-licensed source samples
across three languages (designed so adding a language is just dropping in a new
seed file), each row carrying its own `source`:

- `data/seeds/code-typescript.json` — TypeScript lines representative of an
  **[Express](https://github.com/expressjs/express)**-style HTTP service.
  Express is **MIT**-licensed. `source: "Express (curated TypeScript seed)"`.
- `data/seeds/code-python.json` — Python lines representative of a
  **[FastAPI](https://github.com/fastapi/fastapi)**-style service. FastAPI is
  **MIT**-licensed. `source: "FastAPI (curated Python seed)"`.
- `data/seeds/code-bash.json` — idiomatic Bash lines authored for Pocket,
  **MIT**. `source: "Pocket (hand-authored)"`.

Provenance note: these are hand-curated seeds in the style of the named
projects, within the 120-char code line cap; overly long lines are dropped
rather than shipped. The Stack is **not** used at runtime. Regenerate from a
local OSS checkout with `scripts/curate-code.ts` (point it at `data/code-raw/`).
See `data/PROVENANCE.md`.

## Corpus (email context) — Enron Email Corpus

The **email** context corpus (`data/seeds/email.json`) is a small,
**PII-scrubbed**, hand-reviewed seed of representative business-email sentences
in the style of the **Enron Email Corpus** — a widely-used research dataset of
messages made public by the U.S. Federal Energy Regulatory Commission (FERC)
during its investigation and subsequently prepared for research by the CALO
project / MIT / CMU. The corpus is treated as effectively public domain.

`source: "Enron Email Corpus (curated, PII-scrubbed seed)"`,
`license: "Public Domain (Enron Email Corpus)"`.

The Enron data is **dated** and contains real people's information. Every shipped
line was **read by a human** and scrubbed: person names, email addresses, phone
numbers, dates, and street addresses were replaced with `[NAME]`, `[EMAIL]`,
`[PHONE]`, `[DATE]`, `[ADDRESS]` placeholders. **Raw Enron message files are
never committed** (`data/enron-raw/` is git-ignored). Full scrubbing rules and
the manual-review posture: `data/PROVENANCE.md`.

## Corpus (teams context) — hand-curated (Pocket)

The **teams** context corpus (`data/seeds/teams.json`) is a hand-curated starter
set of short, realistic workplace-chat snippets (status updates, meeting acks,
quick questions, @mentions), written for Pocket. `source: "Pocket
(hand-curated)"`, `license: "MIT"`.

In v1.1 these are **hand-written, not LLM-synthesized.** PRD §5 floats
LLM-synthesized Teams snippets; that is a separate decision deferred past v1.1.
See `data/PROVENANCE.md`.

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
