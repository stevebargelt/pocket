# Pocket — guide for engineers and agents

Pocket is a single-user, local-first typing tutor for the MoErgo Glove 80 split
keyboard. One Node process serves a React single-page app and a JSON API on
`http://localhost:3000` and keeps every keystroke in one SQLite file; there are no
accounts, no cloud and no telemetry. [PRD.md](PRD.md) is the product spec.

## Layout

One npm package at the root (`package.json`, ES modules). Everything is
TypeScript, run directly with `tsx`; only the client is bundled. Node 24 from
`.nvmrc`; the jsdom UI tests need Node ≥ 24.15.

| Path | What it is |
|---|---|
| `src/server/` | Express 4 server. `index.ts` entry; `app.ts` (`createApp`, helmet, error middleware); `routes.ts` (`/api` router); `db.ts` (better-sqlite3, migration runner); `ema.ts`, `weakness.ts`, `aggregate.ts` (weakness engine); `keymap/` (ZMK parser, directory watcher, fingerprint); `drills/` (layer and thumb drills); `shortcutDrills.ts`. |
| `src/client/` | React 18 SPA, Vite 6 + Tailwind 3. Vite root is `src/client`, output `dist/`. `api.ts` is the only module that calls the server. |
| `src/shared/` | Types, constants, metrics, bigram and chord models imported by both sides. |
| `migrations/` | Numbered SQL files `NNN_name.sql`, applied in order by `src/server/db.ts`. |
| `data/seeds/` | Committed practice corpora, one or more JSON files per context. |
| `scripts/` | `seed-corpus.ts` and the `curate-*.ts` corpus builders. |
| `test/` | Every test, flat: `test/*.test.ts`, `test/*.test.tsx`, plus `helpers/` and `fixtures/keymaps/`. |
| `docs/` | Architecture diagrams, security notes, logo SVGs. |
| `backlog/` | Markdown work items. Not part of the app. |

## Commands

Run from the repository root. CI runs the first four, in this order, on Ubuntu
with Node from `.nvmrc`:

```bash
npm ci              # install exactly from package-lock.json
npm run typecheck   # tsc --noEmit over src/, test/, scripts/ and vite.config.ts
npm test            # tsx --test test/*.test.ts test/*.test.tsx (node:test)
npm run build       # vite build -> dist/
```

- One test file: `npx tsx --test test/ema.test.ts`.
- One test by name: `npx tsx --test --test-name-pattern="<regex>" test/ema.test.ts`.
- If a `tsx` command fails with `EINVAL` on `listen ... .pipe`, `$TMPDIR` is too
  long for a macOS socket path; rerun with `TMPDIR=/tmp`.
- There is no linter or formatter. `typecheck` (`strict`, `noUnusedLocals`,
  `noUnusedParameters`) is the only static check.
- No tier needs an emulator, simulator or device. The UI tests run in jsdom inside
  `npm test`; `test/e2e.test.ts` starts the API on a random port against a temp
  database.

Running the app (the first two keep running until stopped):

```bash
npm start       # vite build, then Express on :3000 serving dist/ and /api
npm run dev     # Vite on :5173 (proxies /api/ to :3000) + `tsx watch` server on :3000
npm run seed    # load data/seeds/*.json into the database (idempotent per context)
```

The server also seeds the corpus on start when it is empty. Environment:
`PORT` (default 3000), `POCKET_DB` (default `<root>/pocket.db`),
`POCKET_KEYMAP_PATH` (default: the newest `*.keymap` in `<root>/keymaps/`, which
is gitignored and watched for re-exports). With no keymap the app still runs.

`npm run curate`, `npm run curate:cli` and `npm run curate:code` need raw corpora
you fetch yourself into gitignored paths under `data/` (or `POCKET_WILDCHAT`,
`POCKET_TLDR`, `POCKET_CODE`). Without them they exit 1 and leave the committed
seeds untouched. See [data/PROVENANCE.md](data/PROVENANCE.md).

## Conventions that are easy to get wrong

- **Commits** follow Conventional Commits with a scope and the issue key:
  `fix(server): rebuild each layout's stats from that layout's keystrokes only (PKT-13)`.
  Types in use: `feat`, `fix`, `perf`, `test`, `docs`, `ci`, `chore`; scopes
  `server`, `client`, `keymap`. A pull request lands on `main` as one commit whose
  subject is the PR title plus `(#N)`.
- **Tests live flat in `test/`.** The `npm test` glob is not recursive: a test
  file in a subdirectory never runs. A `.test.tsx` UI test must
  `import "./helpers/dom"` before React or Testing Library, and must not reach a
  real server (the helper mocks `fetch`). Tests open in-memory or temp-directory
  SQLite and never touch `pocket.db`.
- **Typecheck covers tests and scripts**, so an unused import in a test fails CI.
- **Migrations are forward-only.** Add the next `NNN_name.sql`; never edit a
  shipped one. The runner applies each file numbered above `PRAGMA user_version`
  in its own transaction and then sets `user_version`.
- **`keystrokes` is the source of truth.** `key_stats` and `bigram_stats` are a
  derived cache that `POST /api/rebuild` recomputes from it; `session_key_stats`
  is written once per session at save. Never alter `keystrokes` destructively.
- **The EMA fold must stay a pure left fold** so the incremental write path and a
  full rebuild give identical stats (header comment in `src/server/ema.ts`).
- **Metrics are defined once**, in `src/shared/metrics.ts`, and used by the live
  UI, the save path and history.
- **One keycode table.** `src/server/keymap/keycodes.ts` is the only
  keycode → character/glyph map; the keymap SVG, Mac modifier glyphs, layer-drill
  extraction and thumb labels all read it through `parser.ts`. Do not add another.
- **Layout identity is a content hash.** `src/server/keymap/fingerprint.ts`
  hashes the parsed bindings and layer names (SHA-256); the `layouts` row upserts
  on that fingerprint, so a re-export under a new filename is the same layout.
  Sessions, stats and shortcut drills are stamped with it; with no keymap it is
  `LAYOUT_FINGERPRINT = "v1-unknown-layout"`.
- **SQL interpolation is allowlisted.** Every `${...}` in SQL text under
  `src/server` must be listed in `ALLOWED` in `test/sql-safety.test.ts` and in
  the table in [docs/security.md](docs/security.md); the test checks both.
- **Generated files.** `dist/` is build output (gitignored).
  `data/seeds/prompts.json`, `cli-tldr.json` and `code-*.json` are written by the
  `curate` scripts; the other seed files are hand-curated. A dependency change
  must update `package-lock.json` (`npm install`), or `npm ci` fails in CI.
- **CI has a 10-minute job timeout**, so a test that hangs fails the run.

## What a merge to `main` does

The only workflow is `.github/workflows/ci.yml` (check `CI / check`). A push to
`main` runs the same `npm ci` → typecheck → test → build job as a pull request.
Nothing is deployed, published or released: the app runs only on the user's own
machine. Pull-request runs for the same branch cancel each other; `main` runs do
not.

## Deeper docs

- [README.md](README.md) — features, scripts, metric contract, weakness engine,
  data model.
- [PRD.md](PRD.md) — product requirements and version scope.
- [docs/architecture/diagrams.md](docs/architecture/diagrams.md) — components,
  runtime and CI, session save flow, shortcut drill flow.
- [docs/security.md](docs/security.md) — security headers and the SQL
  interpolation allowlist.
- [data/PROVENANCE.md](data/PROVENANCE.md) and [CREDITS.md](CREDITS.md) — corpus
  sources, licences, email PII scrubbing.

There is no separate development guide or runbook; the README's "Checks"
section is the development guide.
