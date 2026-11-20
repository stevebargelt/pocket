# Pocket architecture diagrams

Three Mermaid views of Pocket as it is on `main`: its components, how it runs and is checked, and how a practice session is saved and turned into stats.

## Components

The browser client is a React SPA whose only link to the server is `src/client/api.ts`, which talks HTTP JSON to `/api`. On the server, `src/server/index.ts` opens the database, seeds the corpus when it is empty, starts the keymap holder and hands both to `createApp`, which wires a fixed middleware chain ending in the `/api` router (`src/server/routes.ts`). `src/shared` holds the types, constants and metric code that both sides import, so the live UI and the save path compute the same numbers. All persistent state is one SQLite file, `pocket.db`, opened and migrated by `src/server/db.ts`.

```mermaid
flowchart LR
  subgraph client["Browser client · src/client"]
    app_tsx["App.tsx"]
    session_ui["session/<br/>TypingSurface · ResultsScreen<br/>ContextPicker · LayerPicker"]
    history_ui["history/<br/>HistoryView · TrendChart"]
    rec_card["recommender/RecommenderCard"]
    comps["components/<br/>HeatMap · KeymapView"]
    api_ts["api.ts"]
    app_tsx --> session_ui
    app_tsx --> history_ui
    app_tsx --> rec_card
    app_tsx --> comps
    session_ui --> api_ts
    history_ui --> api_ts
    rec_card --> api_ts
    app_tsx --> api_ts
  end

  shared["src/shared<br/>types · constants · metrics · bigrams · summary"]

  subgraph server["Server · src/server"]
    index_ts["index.ts<br/>getDb · seedCorpus · initKeymapHolder · createApp"]

    subgraph app_chain["app.ts createApp middleware chain"]
      direction LR
      mw_helmet["helmet"] --> mw_json["express.json"] --> mw_api["/api router<br/>routes.ts"] --> mw_404["/api JSON 404"] --> mw_static["static dist/<br/>+ SPA fallback"] --> mw_err["JSON error handler"]
    end

    generator_ts["generator.ts"]
    sessions_ts["sessions.ts"]
    recommender_ts["recommender.ts"]
    aggregate_ts["aggregate.ts"]
    ema_ts["ema.ts"]
    weakness_ts["weakness.ts"]
    corpus_ts["corpus.ts"]
    sqlid_ts["sqlIdentifiers.ts"]
    layer_drills["drills/layerDrills.ts"]
    thumb_drills["drills/thumbDrills.ts"]
    keymap_port["KeymapPort<br/>getActiveKeymap · getActiveFingerprint"]

    subgraph keymap["keymap/"]
      holder_ts["holder.ts"]
      parser_ts["parser.ts"]
      fingerprint_ts["fingerprint.ts"]
    end

    layouts_ts["layouts.ts"]
    db_ts["db.ts<br/>openDb · runMigrations · setUserVersion"]

    index_ts -- "createApp(db, keymap port)" --> mw_helmet
    index_ts --> db_ts
    index_ts --> corpus_ts
    index_ts --> holder_ts
    index_ts -- "upsert on reload" --> layouts_ts

    mw_api -- "GET /text" --> generator_ts
    mw_api -- "POST /session<br/>GET /history" --> sessions_ts
    mw_api -- "GET /recommendation" --> recommender_ts
    mw_api -- "POST /rebuild" --> aggregate_ts
    mw_api -- "GET /drill" --> layer_drills
    mw_api -- "GET /drill" --> thumb_drills
    mw_api -- "GET /drill: corpus + weak bigrams" --> corpus_ts
    mw_api -- "GET /drill" --> weakness_ts
    mw_api -- "GET /keymap · /layers<br/>active fingerprint" --> keymap_port

    keymap_port -. "wired in index.ts" .-> holder_ts
    sessions_ts --> aggregate_ts --> ema_ts
    generator_ts --> weakness_ts
    recommender_ts --> weakness_ts
    generator_ts --> corpus_ts
    aggregate_ts --> sqlid_ts
    weakness_ts --> sqlid_ts
    holder_ts --> parser_ts
    holder_ts --> fingerprint_ts
  end

  db[("SQLite pocket.db<br/>sessions · keystrokes · session_key_stats<br/>key_stats · bigram_stats<br/>corpus_items · layouts")]

  api_ts -- "HTTP JSON" --> mw_api
  shared -.-> client
  shared -.-> server
  db_ts --> db
```

## Runtime and checks

Pocket runs as one local Node 24 process on `localhost:3000` (`PORT`) that serves the built `dist/` bundle and the `/api` routes, reads and writes `pocket.db` (path overridable with `POCKET_DB`), applies `migrations/*.sql` and seeds from `data/seeds/` at startup, and watches `keymaps/` (or `POCKET_KEYMAP_PATH`) with debounced reloads. In development, Vite serves the client on `:5173` and proxies `/api/` to the same Express server on `:3000`. The only automation is the GitHub Actions `CI / check` job, which runs on every pull request and every push to `main`. There is no deploy, no cloud service and no secret anywhere in this picture.

```mermaid
flowchart TB
  subgraph local["Local machine"]
    browser["Browser"]
    vite["Vite dev server :5173<br/>npm run dev only<br/>proxies /api/ to :3000"]

    subgraph node["Node 24 process · src/server/index.ts · localhost:3000 PORT"]
      express["Express createApp<br/>serves dist/ + /api"]
      holder["keymap holder<br/>fs.watch + debounced reload"]
    end

    dist["dist/<br/>vite build output"]
    dbfile[("pocket.db<br/>POCKET_DB overrides path")]
    keymaps["keymaps/*.keymap<br/>gitignored<br/>POCKET_KEYMAP_PATH overrides"]
    migrations["migrations/*.sql"]
    seeds["data/seeds/*.json"]

    browser -- "npm start / npm run serve" --> express
    browser -. "npm run dev" .-> vite
    vite -. "/api/*" .-> express
    express -- "static files" --> dist
    express -- "read / write" --> dbfile
    migrations -- "runMigrations at startup" --> dbfile
    seeds -- "seedCorpus when corpus is empty" --> dbfile
    keymaps -- "fs.watch" --> holder
    holder -- "active keymap + fingerprint" --> express
  end

  subgraph gha["GitHub Actions CI / check · timeout 10 min"]
    trigger["pull_request<br/>or push to main"]
    npm_ci["npm ci"]
    typecheck["npm run typecheck"]
    test["npm test"]
    build["npm run build"]
    trigger --> npm_ci --> typecheck --> test --> build
  end
```

## Session save and stats

When a run ends, `TypingSurface` stamps the result with a fresh `clientId` and `ResultsScreen` posts it once; `upsertSession` writes the session, its keystrokes, its per-key stats and the EMA fold in a single transaction, and a replay with the same `clientId` returns the stored row instead of inserting a second one. `POST /api/rebuild` recomputes the EMA cache from the keystroke log for every layout fingerprint that has sessions, folding each layout only from its own keystrokes (joined through `sessions.layout_fingerprint` and streamed with `.iterate()`), and drops `key_stats` and `bigram_stats` rows for layouts with no keystrokes left. Reads never replay keystrokes: history comes from `sessions` and `session_key_stats`, and the recommendation and targeted text come from the weakness ranking over `key_stats` and `bigram_stats`.

```mermaid
sequenceDiagram
  autonumber
  participant TS as TypingSurface
  participant RS as ResultsScreen
  participant API as api.ts
  participant R as routes.ts
  participant S as sessions.ts upsertSession
  participant A as aggregate.ts
  participant DB as pocket.db

  TS->>TS: finish, clientId = crypto.randomUUID()
  TS->>RS: onComplete result via App, with clientId
  RS->>API: saveSession(payload)
  API->>R: POST /api/session
  R->>R: validateSessionPayload
  alt payload invalid
    R-->>API: 400 with error
  else payload valid
    R->>S: upsertSession(db, payload, active fingerprint)
    S->>DB: BEGIN transaction
    S->>DB: SELECT id FROM sessions WHERE client_id = clientId
    alt client_id already saved
      S-->>R: existing row, created false
      R-->>API: 200 existing session
    else new client_id
      S->>DB: INSERT sessions row
      S->>DB: INSERT keystrokes
      S->>A: writeSessionKeyStats
      A->>DB: INSERT session_key_stats
      S->>A: updateAggregatesIncremental
      A->>DB: EMA fold into key_stats and bigram_stats
      S->>DB: COMMIT
      S-->>R: new row, created true
      R-->>API: 201 new session
    end
  end

  opt POST /api/rebuild
    R->>A: rebuildAggregatesFromKeystrokes
    A->>DB: BEGIN transaction
    A->>DB: list layout fingerprints that have sessions
    loop each fingerprint
      A->>DB: readOrderedKeystrokes streams that layout's rows with .iterate()
      A->>A: foldKeystrokes over that layout's log
    end
    A->>DB: DELETE all key_stats and bigram_stats rows
    A->>DB: rewrite key_stats and bigram_stats per fingerprint
    A->>DB: COMMIT
    R-->>API: 200 ok true
  end

  Note over R,DB: Reads
  API->>R: GET /api/history
  R->>DB: getHistory reads sessions + session_key_stats
  API->>R: GET /api/recommendation
  R->>DB: weakness.ts ranks key_stats + bigram_stats
  API->>R: GET /api/text?mode=targeted
  R->>DB: weakness.ts ranks bigram_stats, generator.ts picks corpus_items
```
