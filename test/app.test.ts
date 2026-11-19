import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type CreateAppOptions } from "../src/server/app";
import { openDb } from "../src/server/db";

async function withServer(
  opts: CreateAppOptions,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const app = createApp(openDb(":memory:"), opts);
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
