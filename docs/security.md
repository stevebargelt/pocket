# Security

Pocket is a local-first app: one Express server on `http://localhost:3000`, one
SQLite file, one user. This page records the two server-side hardening rules and
where they are enforced.

## Headers

`createApp` (`src/server/app.ts`) disables Express's `X-Powered-By` header and
mounts [helmet](https://helmetjs.github.io/) with its defaults, which set, among
others:

- `Content-Security-Policy` — `default-src 'self'`, `script-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'self'`, and the rest of helmet's default
  policy, so the SPA only loads its own scripts.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Resource-Policy: same-origin`.

Two defaults are turned off on purpose, because Pocket serves plain HTTP on
localhost:

- **No `Strict-Transport-Security`.** There is no TLS to pin, and HSTS on
  `localhost` would make the browser refuse plain-HTTP local servers.
- **No `upgrade-insecure-requests` CSP directive.** It would rewrite the app's
  own `http://localhost:3000` asset loads to `https` and break the app.

See the comment in `createApp`. `test/app.test.ts` checks these headers on both
`/api` responses and the SPA fallback.

## SQL construction

Every value is bound with a `?` parameter. SQLite cannot bind a table name, a
column name, or the value of a `PRAGMA`, so the server interpolates into SQL
text only at the sites below. Each interpolated value comes from an internal
constant or a validated integer, never from a request.

| File | Function | Expression | Where the value comes from |
| --- | --- | --- | --- |
| `src/server/aggregate.ts` | `loadFoldMap`, `writeFoldMap` | `STAT_TABLES[kind].table` | `STAT_TABLES` in `src/server/sqlIdentifiers.ts`; `kind` is the `StatKind` `"key"` or `"bigram"`, so the value is `key_stats` or `bigram_stats`. |
| `src/server/aggregate.ts` | `loadFoldMap`, `writeFoldMap` | `STAT_TABLES[kind].unitCol` | `STAT_TABLES`; the value is `key` or `bigram`. |
| `src/server/weakness.ts` | `loadStats` | `STAT_TABLES[kind].table` | `STAT_TABLES`; as above. |
| `src/server/weakness.ts` | `loadStats` | `STAT_TABLES[kind].unitCol` | `STAT_TABLES`; as above. |
| `src/server/sessions.ts` | `saveSession`, `getHistory` | `SESSION_COLUMNS` | Module-level constant column list in `sessions.ts`. |
| `src/server/sessions.ts` | `getHistory` | `placeholders` | A comma-joined list of `?`, one per session id; the ids themselves are bound. |
| `src/server/db.ts` | `setUserVersion` | `version` | Migration file-name prefix (`runMigrations` rejects a `NaN` prefix); `setUserVersion` throws unless it is a non-negative safe integer. |

`test/sql-safety.test.ts` enforces this list: it scans every `.ts` file under
`src/server/` and fails on any `${...}` inside SQL text that is not on its
allowlist, and fails if an allowlist entry is missing from the table above.
Adding an interpolation means adding it to both the test's allowlist and this
table.
