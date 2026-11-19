import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type CreateAppOptions } from "../src/server/app";
import { openDb, type Db } from "../src/server/db";

async function withServer(
  opts: CreateAppOptions,
  fn: (base: string) => Promise<void>,
  db: Db = openDb(":memory:"),
): Promise<void> {
  const app = createApp(db, opts);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://localhost:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function assertSecurityHeaders(res: Response): void {
  const csp = res.headers.get("content-security-policy");
  assert.ok(csp, "content-security-policy header present");
  assert.ok(csp.includes("default-src 'self'"), `CSP has default-src 'self': ${csp}`);
  assert.ok(csp.includes("script-src 'self'"), `CSP has script-src 'self': ${csp}`);
  assert.ok(!csp.includes("upgrade-insecure-requests"), `CSP has no upgrade-insecure-requests: ${csp}`);
  assert.ok(res.headers.get("x-frame-options"), "x-frame-options header present");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-powered-by"), null, "no x-powered-by header");
  assert.equal(res.headers.get("strict-transport-security"), null, "no strict-transport-security header");
}

test("createApp: /api responses carry the security headers", async () => {
  await withServer({ distDir: null }, async (base) => {
    const res = await fetch(`${base}/api/history`);
    assertSecurityHeaders(res);
  });
});

test("createApp: GET /api/history returns 200 with a JSON array behind the middleware", async () => {
  await withServer({ distDir: null }, async (base) => {
    const res = await fetch(`${base}/api/history`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.ok(Array.isArray(await res.json()), "history body is an array");
  });
});

test("createApp: with a distDir, client routes fall back to index.html with the CSP header", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-app-dist-"));
  const html = '<!doctype html><html><body><div id="root"></div></body></html>';
  writeFileSync(join(dir, "index.html"), html);
  try {
    await withServer({ distDir: dir }, async (base) => {
      const res = await fetch(`${base}/some/client/route`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") ?? "", /text\/html/);
      assert.equal(await res.text(), html);
      assertSecurityHeaders(res);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createApp: with distDir null, no static route is mounted", async () => {
  await withServer({ distDir: null }, async (base) => {
    const res = await fetch(`${base}/some/client/route`);
    assert.equal(res.status, 404);
    const root = await fetch(`${base}/`);
    assert.equal(root.status, 404);
  });
});

test("createApp: malformed JSON body returns a JSON 400", async () => {
  await withServer({ distDir: null }, async (base) => {
    const res = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const body = (await res.json()) as { error?: unknown };
    assert.equal(typeof body.error, "string");
  });
});

test("createApp: a thrown handler error returns an opaque JSON 500 with security headers", async () => {
  const db = openDb(":memory:");
  db.close(); // better-sqlite3 now throws "The database connection is not open"
  const errorLog = mock.method(console, "error", () => {});
  try {
    await withServer(
      { distDir: null },
      async (base) => {
        const res = await fetch(`${base}/api/history`);
        assert.equal(res.status, 500);
        assert.match(res.headers.get("content-type") ?? "", /application\/json/);
        const text = await res.text();
        assert.deepEqual(JSON.parse(text), { error: "internal error" });
        assert.ok(!text.includes("at "), `body leaks a stack: ${text}`);
        assert.ok(!text.includes("connection"), `body leaks the message: ${text}`);
        assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      },
      db,
    );
    assert.equal(errorLog.mock.callCount(), 1);
    assert.equal(errorLog.mock.calls[0].arguments[0], "Pocket: unhandled error");
  } finally {
    errorLog.mock.restore();
  }
});

test("createApp: unknown /api path returns a JSON 404 with distDir null", async () => {
  await withServer({ distDir: null }, async (base) => {
    const res = await fetch(`${base}/api/does-not-exist`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await res.json(), { error: "not found" });
  });
});

test("createApp: unknown /api path returns a JSON 404, not index.html, when a distDir exists", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-app-dist-"));
  const html = '<!doctype html><html><body><div id="root"></div></body></html>';
  writeFileSync(join(dir, "index.html"), html);
  try {
    await withServer({ distDir: dir }, async (base) => {
      const res = await fetch(`${base}/api/does-not-exist`);
      assert.equal(res.status, 404);
      assert.match(res.headers.get("content-type") ?? "", /application\/json/);
      const text = await res.text();
      assert.notEqual(text, html);
      assert.deepEqual(JSON.parse(text), { error: "not found" });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
