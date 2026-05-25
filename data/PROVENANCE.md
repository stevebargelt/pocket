# Corpus provenance & privacy

This file is the source of truth for **where every shipped corpus line comes
from**, **what license governs it**, and **how privacy-sensitive sources were
sanitized** before they were committed. Attribution that needs to be visible to
end users also lives in `../CREDITS.md`; this file is the deeper, build-time
record.

Ground rules for every context:

- **No runtime fetches.** Every line is curated at build/seed time and committed
  as a reviewed JSON seed under `data/seeds/`. Pocket never downloads a corpus
  while running.
- **Raw upstream dumps are never committed.** The curate scripts read a *local,
  git-ignored* checkout (`data/tldr-raw/`, `data/code-raw/`, `data/enron-raw/`,
  `data/wildchat-raw/`) and emit reviewed seeds. The raw dirs are in
  `.gitignore`.
- **Each row carries its own `source` + `license`.** A context can be assembled
  from several seed files with different provenance (e.g. `cli` = tldr-pages +
  hand-authored), and the per-row attribution survives into the `corpus_items`
  table.
- **Line-length caps** are enforced per context at curate/seed time
  (`CORPUS_LINE_CAPS` in `src/shared/constants.ts`): prose contexts
  (prompts/email/teams) 12–200 chars, code 12–120, CLI 4–80.

---

## prompts — WildChat-1M (curated seed)

- **Seed file:** `data/seeds/prompts.json`
- **Source:** `WildChat-1M (curated seed)`
- **License:** `ODC-BY-1.0`
- **Provenance:** Single-turn, English, PII-free human prompts ≤200 chars
  mirroring [WildChat-1M](https://huggingface.co/datasets/allenai/WildChat-1M)
  (Allen Institute for AI, ODC-BY 1.0). The raw dump was unavailable in this
  build environment, so the shipped file is a hand-curated seed. Regenerate from
  a local dump with `scripts/curate-corpus.ts`.
- Carried over from v1; unchanged by v1.1.

---

## cli — tldr-pages + hand-authored

The CLI context is assembled from **two** seed files sharing `context: "cli"`.

### `data/seeds/cli-tldr.json`

- **Source:** `tldr-pages`
- **License:** `CC-BY-4.0` — **attribution is required and is provided in
  `../CREDITS.md`.**
- **Provenance:** Short, common command-line examples in the style of
  [tldr-pages](https://github.com/tldr-pages/tldr). A raw tldr-pages checkout was
  not available at build time, so these are hand-curated in that style and
  honestly labeled with the tldr-pages source + CC-BY-4.0 license. Regenerate
  from a local clone with `scripts/curate-cli.ts` (reads `data/tldr-raw/`,
  preserves CC-BY attribution, never downloads).

### `data/seeds/cli-handauthored.json`

- **Source:** `Pocket (hand-authored)`
- **License:** `MIT`
- **Provenance:** Original, day-to-day developer commands (git, docker, npm,
  kubectl, …) authored for Pocket to round out the CLI context.

### nl2bash is deliberately NOT bundled

PRD §5 names [nl2bash](https://github.com/TellinaTool/nl2bash) as a CLI source.
nl2bash's data is released for **research / non-commercial** use. That term
**conflicts with shipping the data inside this MIT-licensed repository**, so
**no nl2bash data files are included** anywhere in this project — not in the
seeds, not in `data/`, not in the curate scripts' output. The CLI context is
served entirely by tldr-pages-style + hand-authored lines instead. If nl2bash is
ever wanted, it must be consumed under its own license, separately, and not
redistributed here.

---

## code — Express / FastAPI / Bash (curated seeds)

The code context is assembled from **three** seed files sharing `context:
"code"`, one per language. The loader merges all `code` seeds, so **adding a
language is just dropping in another `code-<lang>.json` seed file** (no code
change). All lines respect the 120-char code cap; lines that would exceed it
(e.g. very long imports) are dropped rather than shipped.

| Seed file | Language | Source | License |
|---|---|---|---|
| `data/seeds/code-typescript.json` | TypeScript | `Express (curated TypeScript seed)` — style of [Express](https://github.com/expressjs/express) | MIT |
| `data/seeds/code-python.json` | Python | `FastAPI (curated Python seed)` — style of [FastAPI](https://github.com/fastapi/fastapi) | MIT |
| `data/seeds/code-bash.json` | Bash | `Pocket (hand-authored)` | MIT |

**Provenance:** Hand-curated, self-contained statements in the style of the
named permissively-licensed OSS projects. **The Stack is not used at runtime**
(PRD §5 floats it; we ship small curated seeds instead). Regenerate from a local
OSS checkout with `scripts/curate-code.ts` (reads `data/code-raw/`, applies the
code cap + dedup, never downloads).

---

## email — Enron Email Corpus (curated, PII-scrubbed seed)

- **Seed file:** `data/seeds/email.json`
- **Source:** `Enron Email Corpus (curated, PII-scrubbed seed)`
- **License:** `Public Domain (Enron Email Corpus)` — the Enron messages were
  made public by the U.S. Federal Energy Regulatory Commission (FERC) during its
  investigation and later prepared for research (CALO project / MIT / CMU). The
  corpus is treated as effectively public domain.

### Why this source needs special handling

The Enron data is **real correspondence from real people** and is **dated**.
Publishing it verbatim into a public MIT repo would republish live PII. So this
context is **hand-curated with manual human review of every shipped line** — it
is **not** a scripted regex pass over the raw mailboxes.

### PII scrubbing rules

Every shipped line was read by a human and sanitized by replacing
personally-identifying content with bracketed placeholders:

| Replaced content | Placeholder |
|---|---|
| Person names (first/last/full, signatures) | `[NAME]` |
| Email addresses | `[EMAIL]` |
| Phone / fax numbers | `[PHONE]` |
| Dates and specific date/time references | `[DATE]` |
| Street / mailing addresses | `[ADDRESS]` |

Additional rules:

- Lines that could not be safely de-identified were **dropped, not patched**.
- No account numbers, deal IDs, or other identifiers tied to a real individual
  were retained.
- The result reads as generic business-email phrasing suitable for typing
  practice, not as a recoverable message.

### Manual-review posture (why not regex)

Regex can catch emails and phone numbers, but it **cannot reliably strip person
names**, and a single miss republishes live PII into a public repository. The
brief's target size (~50–100 lines) is small enough to review by hand, so the
shipped seed is human-reviewed line by line. **Raw Enron message files are never
committed** — `data/enron-raw/` is git-ignored and exists only as a local,
transient working dir.

---

## teams — hand-curated (Pocket)

- **Seed file:** `data/seeds/teams.json`
- **Source:** `Pocket (hand-curated)`
- **License:** `MIT`
- **Provenance:** A hand-curated starter set of short, realistic workplace-chat
  snippets — status updates, meeting acknowledgements, quick questions, and
  `@mentions`.

### Hand-curated, NOT LLM-synthesized in v1.1

PRD §5 / §10 floats **LLM-synthesized** Teams snippets generated at build time.
For v1.1 the Teams corpus is **hand-written by a human**, not generated by a
model. LLM synthesis of this corpus (which model, what prompt template, how
many lines, and how to review the output) is a **separate decision deferred past
v1.1** and is intentionally not implemented here.
