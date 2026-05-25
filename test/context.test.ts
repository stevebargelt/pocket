import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../src/server/db";
import { generateText } from "../src/server/generator";
import { saveSession } from "../src/server/sessions";
import { createApiRouter } from "../src/server/routes";
import type { GeneratedText } from "../src/server/generator";
import { LAYOUT_FINGERPRINT } from "../src/shared/constants";
import type { KeystrokeRecord, SessionPayload, SessionRow } from "../src/shared/types";

// Self-contained fixture corpora: these tests insert exactly the rows they
// assert on rather than calling seedCorpus, so they stay deterministic
// regardless of which contexts the real seed files happen to populate.
const CLI_LINES = ["git status", "ls -la", "cd ~/projects", "grep -rn TODO ."];
const PROMPT_LINES = [
  "explain this concept like i am five years old",
  "rewrite the following paragraph to be more concise",
];

function insertCorpus(db: Db, context: string, texts: string[]): void {
  const ins = db.prepare(
    "INSERT INTO corpus_items (context, text, source, license) VALUES (?, ?, ?, ?)",
  );
  for (const t of texts) ins.run(context, t, "test-fixture", "test");
}

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  const keystrokes: KeystrokeRecord[] = Array.from("hello world").map((c, i) => ({
    index: i,
    expectedChar: c,
    actualChar: c,
    latencyMs: 100,
    correct: true,
  }));
  return {
    startedAt: 0,
    endedAt: 60_000,
    mode: "random",
    targetSeconds: 60,
    targetChars: 11,
    keystrokes,
    ...overrides,
  };
}

function startServer(): Promise<{ close: () => void; base: string; db: Db }> {
  const dir = mkdtempSync(join(tmpdir(), "pocket-context-"));
  const db = openDb(join(dir, "pocket.db"));
  insertCorpus(db, "prompts", PROMPT_LINES);
  insertCorpus(db, "cli", CLI_LINES);
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api", createApiRouter(db));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ close: () => server.close(), base: `http://localhost:${port}`, db });
    });
  });
}

// --- generator: context selects the corpus ---

test("generateText pulls lines from the requested context's corpus", () => {
  const db = openDb(":memory:");
  insertCorpus(db, "cli", CLI_LINES);
  insertCorpus(db, "prompts", ["please summarize this article in three bullet points"]);

  const out = generateText(db, "random", 4, LAYOUT_FINGERPRINT, "cli");
  assert.ok(out.lines.length > 0, "non-empty for a seeded context");
  for (const line of out.lines) {
    assert.ok(CLI_LINES.includes(line), `line should come from the cli corpus: "${line}"`);
  }
  db.close();
});

// --- sessions: context is persisted, defaults to prompts ---

test("saveSession tags the session with the payload's context", () => {
  const db = openDb(":memory:");
  const row = saveSession(db, payload({ context: "cli" }));
  assert.equal(row.context, "cli");
  const stored = db.prepare("SELECT context FROM sessions WHERE id = ?").get(row.id) as {
    context: string;
  };
  assert.equal(stored.context, "cli");
  db.close();
});

test("saveSession defaults to prompts when the payload omits context", () => {
  const db = openDb(":memory:");
  const row = saveSession(db, payload());
  assert.equal(row.context, "prompts");
  db.close();
});

// --- routes: validation on write, coercion on read ---

test("POST /session with an unknown context returns 400", async () => {
  const { close, base } = await startServer();
  try {
    const res = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload({ context: "bogus" as never })),
    });
    assert.equal(res.status, 400);
  } finally {
    close();
  }
});

test("POST /session with a valid context persists it and history reflects it", async () => {
  const { close, base } = await startServer();
  try {
    const res = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload({ context: "cli" })),
    });
    assert.equal(res.status, 201);
    const saved = (await res.json()) as SessionRow;
    assert.equal(saved.context, "cli");

    const history = (await (await fetch(`${base}/api/history`)).json()) as SessionRow[];
    assert.equal(history.length, 1);
    assert.equal(history[0].context, "cli");
  } finally {
    close();
  }
});

test("GET /text?context=<bad> coerces to prompts rather than returning empty", async () => {
  const { close, base } = await startServer();
  try {
    const text = (await (
      await fetch(`${base}/api/text?mode=random&context=zzz`)
    ).json()) as GeneratedText;
    assert.ok(text.text.length > 0, "coerced to a non-empty default corpus");
    for (const line of text.lines) {
      assert.ok(PROMPT_LINES.includes(line), "coerced result is prompts text, not the cli corpus");
    }
  } finally {
    close();
  }
});

test("GET /text?context=cli returns lines from the cli corpus", async () => {
  const { close, base } = await startServer();
  try {
    const text = (await (
      await fetch(`${base}/api/text?mode=random&context=cli`)
    ).json()) as GeneratedText;
    assert.ok(text.lines.length > 0);
    for (const line of text.lines) {
      assert.ok(CLI_LINES.includes(line), `expected cli line, got: "${line}"`);
    }
  } finally {
    close();
  }
});
