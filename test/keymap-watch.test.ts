import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KeymapHolder, newestKeymap } from "../src/server/keymap/holder";
import { LAYOUT_FINGERPRINT } from "../src/shared/constants";

const HERE = dirname(fileURLToPath(import.meta.url));
const factorySrc = readFileSync(resolve(HERE, "fixtures/keymaps/factory.keymap"), "utf8");
const customSrc = readFileSync(resolve(HERE, "fixtures/keymaps/custom.keymap"), "utf8");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test("holder with no keymap returns null + the sentinel fingerprint", () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-km-empty-"));
  const holder = new KeymapHolder({ dir, watch: false });
  assert.equal(holder.getActiveKeymap(), null);
  assert.equal(holder.getActiveFingerprint(), LAYOUT_FINGERPRINT);
  holder.close();
});

test("holder loads the newest *.keymap in its directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-km-newest-"));
  const older = join(dir, "aaa.keymap");
  const newer = join(dir, "zzz.keymap");
  writeFileSync(older, factorySrc);
  writeFileSync(newer, customSrc);
  // make `newer` unambiguously the most recently modified
  utimesSync(older, new Date(1_000), new Date(1_000));
  utimesSync(newer, new Date(2_000), new Date(2_000));

  assert.equal(newestKeymap(dir), newer);
  const holder = new KeymapHolder({ dir, watch: false });
  assert.ok(
    holder.getActiveKeymap()!.layers.some((l) => l.name === "Symbols"),
    "active keymap is the newer custom variant (renamed Symbols layer)",
  );
  holder.close();
});

test("directory watcher debounces a rapid edit burst into a single reload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-km-watch-"));
  writeFileSync(join(dir, "initial.keymap"), factorySrc);

  let reloads = 0;
  let lastFingerprint = "";
  const debounceMs = 80;
  const holder = new KeymapHolder({
    dir,
    watch: true,
    debounceMs,
    onReload: (_km, fp) => {
      reloads++;
      lastFingerprint = fp;
    },
  });

  // Mimic the editor's temp-write+rename burst: several back-to-back writes.
  for (let i = 0; i < 5; i++) writeFileSync(join(dir, `export-${i}.keymap`), customSrc);
  // ensure the last-written file is unambiguously newest
  const winner = join(dir, "export-4.keymap");
  const future = new Date(Date.now() + 5_000);
  utimesSync(winner, future, future);

  // Poll until the reload signal arrives (generous 2 s deadline tolerates CPU starvation
  // under full-suite concurrency). Once it fires, wait an additional settle window to
  // confirm no second reload is queued before asserting the final count.
  const deadline = Date.now() + 2000;
  while (reloads === 0 && Date.now() < deadline) {
    await sleep(20);
  }
  await sleep(debounceMs * 5); // settle: confirm no second reload fires

  assert.equal(reloads, 1, "the burst coalesced into exactly one reload");
  assert.equal(holder.getActiveFingerprint(), lastFingerprint);
  assert.notEqual(holder.getActiveFingerprint(), LAYOUT_FINGERPRINT, "a real keymap is now active");
  assert.ok(
    holder.getActiveKeymap()!.layers.some((l) => l.name === "Symbols"),
    "reloaded to the newest (custom) export",
  );
  holder.close();
});
