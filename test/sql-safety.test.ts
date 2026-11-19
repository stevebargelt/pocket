import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setUserVersion } from "../src/server/db";

// Every `${...}` that reaches SQL text in src/server must be listed here, keyed by
// file (relative to src/server) and the exact expression text. Line numbers and
// counts are deliberately not part of the key: reusing an allowed expression in
// the same file passes. Adding a new interpolation means adding it here AND to
// the table in docs/security.md (a test below checks the two agree).
const ALLOWED: Record<string, readonly string[]> = {
  "aggregate.ts": ["STAT_TABLES[kind].table", "STAT_TABLES[kind].unitCol"],
  "weakness.ts": ["STAT_TABLES[kind].table", "STAT_TABLES[kind].unitCol"],
  "sessions.ts": ["SESSION_COLUMNS", "placeholders"],
  "db.ts": ["version"],
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = join(ROOT, "src/server");
const SQL_KEYWORD = /\b(SELECT|INSERT|UPDATE|DELETE|PRAGMA|CREATE|DROP|ALTER)\b/i;
// better-sqlite3 prepends "PRAGMA" itself, so `db.pragma(`user_version = ${v}`)`
// has no keyword in its text. A template passed straight to one of these calls
// is SQL regardless of its wording.
const SQL_CALL = /\.(prepare|exec|pragma)\(\s*$/;

interface Template {
  /** Static text with each `${...}` replaced by `${}`. */
  text: string;
  exprs: string[];
  /** Source text immediately before the opening backtick. */
  before: string;
}

/**
 * Collect every template literal in a TypeScript source, including ones nested
 * inside `${...}`. A small hand scanner rather than a regex so that backticks
 * inside strings, comments and regex literals (e.g. app.ts's "run `npm run
 * build`" warning) don't mis-pair.
 */
function scanTemplates(src: string): Template[] {
  const out: Template[] = [];
  let i = 0;

  const skipQuoted = (q: string): void => {
    i++;
    while (i < src.length && src[i] !== q) i += src[i] === "\\" ? 2 : 1;
    i++;
  };

  const skipRegex = (): void => {
    i++;
    let inClass = false;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      i++;
    }
    i++;
  };

  const regexAllowed = (): boolean => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return true;
    if ("(,=:[!&|?{};+-*%<>~^".includes(src[j])) return true;
    return /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, j - 6), j + 1));
  };

  // Scan code; if `untilBrace`, stop after the `}` that closes the current `${`.
  const code = (untilBrace: boolean): void => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const n = src[i + 1];
      if (c === "/" && n === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
      if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (c === "/" && regexAllowed()) { skipRegex(); continue; }
      if (c === '"' || c === "'") { skipQuoted(c); continue; }
      if (c === "`") { template(); continue; }
      if (c === "{") depth++;
      if (c === "}") {
        if (untilBrace && depth === 0) { i++; return; }
        depth--;
      }
      i++;
    }
  };

  const template = (): void => {
    const t: Template = { text: "", exprs: [], before: src.slice(Math.max(0, i - 40), i) };
    out.push(t);
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { t.text += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { i++; return; }
      if (c === "$" && src[i + 1] === "{") {
        i += 2;
        const start = i;
        code(true);
        t.exprs.push(src.slice(start, i - 1).trim());
        t.text += "${}";
        continue;
      }
      t.text += c;
      i++;
    }
  };

  code(false);
  return out;
}

function isSql(t: Template): boolean {
  return SQL_KEYWORD.test(t.text) || SQL_CALL.test(t.before);
}

function sqlInterpolations(src: string): string[] {
  return scanTemplates(src).filter(isSql).flatMap((t) => t.exprs);
}

function serverFiles(dir: string = SERVER_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return serverFiles(p);
    return e.name.endsWith(".ts") ? [p] : [];
  });
}

/** Every (file, expression) pair that reaches SQL text in src/server. */
function collectSqlInterpolations(): Array<{ file: string; expr: string }> {
  return serverFiles().flatMap((p) => {
    const file = relative(SERVER_DIR, p).split("\\").join("/");
    return sqlInterpolations(readFileSync(p, "utf8")).map((expr) => ({ file, expr }));
  });
}

test("every SQL interpolation in src/server is on the allowlist", () => {
  const offenders = collectSqlInterpolations()
    .filter(({ file, expr }) => !(ALLOWED[file] ?? []).includes(expr))
    .map(({ file, expr }) => `src/server/${file}: \${${expr}}`);
  assert.deepEqual(
    offenders,
    [],
    "SQL text must only interpolate allowlisted constants; bind values with `?` instead, " +
      "or add the expression to ALLOWED here and to docs/security.md",
  );
});

test("every allowlist entry is still used (no stale entries)", () => {
  const found = new Set(collectSqlInterpolations().map(({ file, expr }) => `${file}\u0000${expr}`));
  const stale = Object.entries(ALLOWED)
    .flatMap(([file, exprs]) => exprs.map((expr) => ({ file, expr })))
    .filter(({ file, expr }) => !found.has(`${file}\u0000${expr}`))
    .map(({ file, expr }) => `${file}: ${expr}`);
  assert.deepEqual(stale, []);
});

test("docs/security.md lists every allowlist entry", () => {
  const doc = readFileSync(join(ROOT, "docs/security.md"), "utf8");
  const rows = doc.split("\n").filter((l) => l.trim().startsWith("|"));
  for (const [file, exprs] of Object.entries(ALLOWED)) {
    for (const expr of exprs) {
      assert.ok(
        rows.some((r) => r.includes(`src/server/${file}`) && r.includes(`\`${expr}\``)),
        `docs/security.md table is missing src/server/${file} / ${expr}`,
      );
    }
  }
});

test("scanner flags SQL templates and skips log/error templates", () => {
  assert.deepEqual(sqlInterpolations("db.prepare(`SELECT * FROM ${userInput}`);"), ["userInput"]);
  assert.deepEqual(sqlInterpolations("db.exec(`delete from t where x = ${x}`);"), ["x"]);
  // A template handed to .pragma() is SQL even without a keyword in its text.
  assert.deepEqual(sqlInterpolations("db.pragma(`user_version = ${v}`);"), ["v"]);
  // Nested braces and nested templates inside an expression.
  assert.deepEqual(sqlInterpolations("q(`SELECT ${f({ a: 1 })} FROM ${`t${n}`}`);"), ["f({ a: 1 })", "`t${n}`"]);
  // Log lines and error messages are not SQL.
  assert.deepEqual(sqlInterpolations("console.log(`Pocket running at http://localhost:${PORT}`);"), []);
  assert.deepEqual(sqlInterpolations("return `keystrokes[${i}].correct must be a boolean`;"), []);
  // Backticks inside strings, comments and regex literals don't open a template.
  assert.deepEqual(
    sqlInterpolations('warn("run `npm run build`"); // `x`\nconst r = /`/; db.prepare(`SELECT ${a}`);'),
    ["a"],
  );
});

test("scanner finds the real non-SQL templates in routes.ts and does not flag them", () => {
  const src = readFileSync(join(SERVER_DIR, "routes.ts"), "utf8");
  const templates = scanTemplates(src);
  assert.ok(templates.some((t) => t.exprs.length > 0), "expected routes.ts to contain interpolating templates");
  assert.deepEqual(templates.filter(isSql), []);
});

test("setUserVersion rejects anything but a non-negative safe integer", () => {
  const db = new Database(":memory:");
  for (const bad of [-1, 1.5, Number.NaN, "3; DROP TABLE x" as unknown as number]) {
    assert.throws(() => setUserVersion(db, bad), /non-negative safe integer/, `should reject ${String(bad)}`);
  }
  assert.equal(db.pragma("user_version", { simple: true }), 0);
  db.close();
});

test("setUserVersion accepts 0 and 4 and reads back user_version", () => {
  const db = new Database(":memory:");
  setUserVersion(db, 4);
  assert.equal(db.pragma("user_version", { simple: true }), 4);
  setUserVersion(db, 0);
  assert.equal(db.pragma("user_version", { simple: true }), 0);
  db.close();
});
