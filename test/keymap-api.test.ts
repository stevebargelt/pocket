import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type Db } from "../src/server/db";
import { seedCorpus } from "../src/server/corpus";
import { saveSession } from "../src/server/sessions";
import { createApiRouter, type KeymapPort } from "../src/server/routes";
import { upsertLayout, getLayout } from "../src/server/layouts";
import {
  KeymapHolder,
  initKeymapHolder,
  resetKeymapHolder,
  getActiveKeymap,
  getActiveFingerprint,
} from "../src/server/keymap/holder";
import type { Keymap } from "../src/server/keymap/types";
import { LAYOUT_FINGERPRINT } from "../src/shared/constants";
import type { KeystrokeRecord, SessionPayload, SessionRow } from "../src/shared/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTORY = resolve(HERE, "fixtures/keymaps/factory.keymap");

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

/** Spin up the API with an injectable keymap port (defaults to the no-keymap sentinel). */
function startServer(port?: KeymapPort): Promise<{ close: () => void; base: string; db: Db }> {
  const dir = mkdtempSync(join(tmpdir(), "pocket-keymap-api-"));
  const db = openDb(join(dir, "pocket.db"));
  seedCorpus(db);
  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use("/api", port ? createApiRouter(db, port) : createApiRouter(db));
  return new Promise((res) => {
    const server = app.listen(0, () => {
      const p = (server.address() as AddressInfo).port;
      res({ close: () => server.close(), base: `http://localhost:${p}`, db });
    });
  });
}

/** A holder-backed port reading a fixture keymap, with no fs.watch (deterministic, leak-free). */
function fixturePort(file = FACTORY): { port: KeymapPort; holder: KeymapHolder } {
  const holder = new KeymapHolder({ pinnedFile: file, watch: false });
  return {
    holder,
    port: {
      getActiveKeymap: () => holder.getActiveKeymap(),
      getActiveFingerprint: () => holder.getActiveFingerprint(),
    },
  };
}

// ── No keymap: the v1.2 endpoints degrade and v1/v1.1 behavior is unchanged ──

test("no keymap: /keymap is null, /layers is empty, /drill 404s", async () => {
  const { close, base } = await startServer();
  try {
    const km = await (await fetch(`${base}/api/keymap`)).json();
    assert.equal(km, null, "no keymap loaded");

    const layers = await (await fetch(`${base}/api/layers`)).json();
    assert.deepEqual(layers, [], "no layers without a keymap");

    const drill = await fetch(`${base}/api/drill?focus=layer&layer=Base`);
    assert.equal(drill.status, 404, "drills unavailable without a keymap");
  } finally {
    close();
  }
});

test("no keymap: /text and /session behave as v1.1 with the sentinel fingerprint", async () => {
  const { close, base } = await startServer();
  try {
    const text = (await (await fetch(`${base}/api/text?mode=random`)).json()) as { text: string };
    assert.ok(text.text.length > 0, "practice text still generated");

    const saveRes = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    assert.equal(saveRes.status, 201);
    const saved = (await saveRes.json()) as SessionRow;
    assert.equal(saved.layoutFingerprint, LAYOUT_FINGERPRINT, "session stamped with the sentinel");
  } finally {
    close();
  }
});

// ── With a keymap: parsing, layers, drills, fingerprint stamping, persistence ──

test("with a keymap: /keymap returns the parsed layers", async () => {
  const { port } = fixturePort();
  const { close, base } = await startServer(port);
  try {
    const km = (await (await fetch(`${base}/api/keymap`)).json()) as Keymap;
    assert.equal(km.layers.length, 4, "factory keymap has 4 layers");
    assert.deepEqual(
      km.layers.map((l) => l.name),
      ["Base", "Lower", "Magic", "Factory"],
    );
    assert.equal(km.layers[0].bindings.length, 80, "Base layer has 80 bindings");
  } finally {
    close();
  }
});

test("with a keymap: /layers lists names with drillable flags (Magic is not drillable)", async () => {
  const { port } = fixturePort();
  const { close, base } = await startServer(port);
  try {
    const layers = (await (await fetch(`${base}/api/layers`)).json()) as Array<{
      name: string;
      index: number;
      drillable: boolean;
    }>;
    assert.equal(layers.length, 4);
    const byName = new Map(layers.map((l) => [l.name, l]));
    assert.equal(byName.get("Base")!.drillable, true, "Base binds letters → drillable");
    assert.equal(byName.get("Lower")!.drillable, true, "Lower binds symbols/digits → drillable");
    assert.equal(
      byName.get("Magic")!.drillable,
      false,
      "Magic is all bt/rgb/none → not drillable",
    );
  } finally {
    close();
  }
});

test("with a keymap: layer drill returns non-empty text for a drillable layer, flagged-empty for Magic", async () => {
  const { port } = fixturePort();
  const { close, base } = await startServer(port);
  try {
    const lower = (await (
      await fetch(`${base}/api/drill?focus=layer&layer=Lower`)
    ).json()) as { drillable: boolean; text: string; focus: string };
    assert.equal(lower.focus, "layer");
    assert.equal(lower.drillable, true);
    assert.ok(lower.text.length > 0, "drillable layer yields non-empty practice text");

    const magic = (await (
      await fetch(`${base}/api/drill?focus=layer&layer=Magic`)
    ).json()) as { drillable: boolean; text: string; reason: string | null };
    assert.equal(magic.drillable, false);
    assert.equal(magic.text, "", "non-drillable layer is explicitly empty, not silently broken");
    assert.ok(magic.reason, "non-drillable layer carries a reason");
  } finally {
    close();
  }
});

test("with a keymap: thumb drill scores space and surfaces guided modifier/layer keys", async () => {
  const { port } = fixturePort();
  const { close, base } = await startServer(port);
  try {
    const thumb = (await (await fetch(`${base}/api/drill?focus=thumb`)).json()) as {
      focus: string;
      drillable: boolean;
      text: string;
      guided: unknown[];
    };
    assert.equal(thumb.focus, "thumb");
    assert.equal(thumb.drillable, true, "Base thumb cluster binds SPACE → scorable");
    assert.ok(thumb.text.length > 0, "thumb drill yields non-empty targeted text");
    assert.ok(thumb.guided.length > 0, "non-scored thumb keys (mods/layers) are returned as guided");
  } finally {
    close();
  }
});

test("with a keymap: /drill rejects malformed requests", async () => {
  const { port } = fixturePort();
  const { close, base } = await startServer(port);
  try {
    assert.equal((await fetch(`${base}/api/drill`)).status, 400, "missing focus → 400");
    assert.equal(
      (await fetch(`${base}/api/drill?focus=layer`)).status,
      400,
      "focus=layer without a layer → 400",
    );
  } finally {
    close();
  }
});

test("with a keymap: a saved session is stamped with the minted fingerprint", async () => {
  const { port, holder } = fixturePort();
  const minted = holder.getActiveFingerprint();
  assert.notEqual(minted, LAYOUT_FINGERPRINT, "a real parse mints a content-hash fingerprint");

  const { close, base, db } = await startServer(port);
  try {
    const saveRes = await fetch(`${base}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    assert.equal(saveRes.status, 201);
    const saved = (await saveRes.json()) as SessionRow;
    assert.equal(saved.layoutFingerprint, minted, "session carries the active layout fingerprint");

    // index.ts registers the layout at boot/reload; simulate that and verify it lands.
    upsertLayout(db, holder.getActiveKeymap()!, minted);
    const layout = getLayout(db, minted);
    assert.ok(layout, "a layouts row exists for the active fingerprint");
    assert.equal(layout!.layerCount, 4);
    assert.equal(layout!.fingerprint, minted);
  } finally {
    close();
  }
});

// ── layouts table: identity is the content hash, not the file ──

test("upsertLayout is idempotent by fingerprint (re-export under a new path updates in place)", () => {
  const db = openDb(":memory:");
  const km: Keymap = {
    layers: [{ name: "Base", bindings: [] }],
    sourcePath: "/keymaps/old.keymap",
    parsedAt: 1,
  };
  const fp = "deadbeef";
  upsertLayout(db, km, fp);
  upsertLayout(db, { ...km, sourcePath: "/keymaps/new-uuid.keymap", parsedAt: 2 }, fp);

  const count = db.prepare("SELECT COUNT(*) AS n FROM layouts").get() as { n: number };
  assert.equal(count.n, 1, "same fingerprint upserts one row, never duplicates");

  const layout = getLayout(db, fp);
  assert.equal(layout!.sourcePath, "/keymaps/new-uuid.keymap", "source_path refreshed");
  assert.equal(layout!.parsedAt, 2);
  db.close();
});

// ── holder env-var resolution (production wiring) ──

test("POCKET_KEYMAP_PATH resolves a fixture into the active holder singleton", () => {
  const prev = process.env.POCKET_KEYMAP_PATH;
  process.env.POCKET_KEYMAP_PATH = FACTORY;
  try {
    initKeymapHolder({ watch: false }); // no fs.watch → no leaked handle
    assert.notEqual(getActiveFingerprint(), LAYOUT_FINGERPRINT, "env-configured keymap mints a fp");
    assert.equal(getActiveKeymap()?.layers.length, 4);
  } finally {
    resetKeymapHolder();
    if (prev === undefined) delete process.env.POCKET_KEYMAP_PATH;
    else process.env.POCKET_KEYMAP_PATH = prev;
  }
});

// ── sessions: the fingerprint param defaults to the sentinel ──

test("saveSession defaults its fingerprint param to the v1 sentinel", () => {
  const db = openDb(":memory:");
  const row = saveSession(db, payload());
  assert.equal(row.layoutFingerprint, LAYOUT_FINGERPRINT);
  db.close();
});
