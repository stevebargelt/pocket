import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, utimesSync, writeFileSync, type FSWatcher } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fsWatchDir, KeymapHolder, newestKeymap, type WatchDir } from "../src/server/keymap/holder";
import { LAYOUT_FINGERPRINT } from "../src/shared/constants";

const HERE = dirname(fileURLToPath(import.meta.url));
const factorySrc = readFileSync(resolve(HERE, "fixtures/keymaps/factory.keymap"), "utf8");
const customSrc = readFileSync(resolve(HERE, "fixtures/keymaps/custom.keymap"), "utf8");

/**
 * A stand-in for fs.watch that the test fires by hand, so a "change" happens exactly
 * when the test says and never arrives late from the OS.
 */
function manualWatcher() {
  const state = { onChange: null as (() => void) | null, closed: false };
  const watchDir: WatchDir = (_dir, onChange) => {
    state.onChange = onChange;
    return { close: () => void (state.closed = true) };
  };
  const change = () => {
    assert.ok(state.onChange, "the holder attached a watcher");
    state.onChange();
  };
  return { watchDir, change, state };
}

test("holder with no keymap returns null + the sentinel fingerprint", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pocket-km-empty-"));
  const holder = new KeymapHolder({ dir, watch: false });
  t.after(() => holder.close());
  assert.equal(holder.getActiveKeymap(), null);
  assert.equal(holder.getActiveFingerprint(), LAYOUT_FINGERPRINT);
});

test("holder loads the newest *.keymap in its directory", (t) => {
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
  t.after(() => holder.close());
  assert.ok(
    holder.getActiveKeymap()!.layers.some((l) => l.name === "Symbols"),
    "active keymap is the newer custom variant (renamed Symbols layer)",
  );
});

test("directory watcher debounces a rapid edit burst into a single reload", (t) => {
  // Fake clock: the debounce timer only advances when the test ticks it.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const dir = mkdtempSync(join(tmpdir(), "pocket-km-watch-"));
  const initial = join(dir, "initial.keymap");
  writeFileSync(initial, factorySrc);
  utimesSync(initial, new Date(1_000), new Date(1_000));

  let reloads = 0;
  let lastFingerprint = "";
  const debounceMs = 80;
  const watcher = manualWatcher();
  const holder = new KeymapHolder({
    dir,
    watch: true,
    debounceMs,
    watchDir: watcher.watchDir,
    onReload: (_km, fp) => {
      reloads++;
      lastFingerprint = fp;
    },
  });
  t.after(() => holder.close());

  // Mimic the editor's temp-write+rename burst: several writes, each one landing just
  // inside the previous event's debounce window, so the timer keeps being pushed back.
  for (let i = 0; i < 5; i++) {
    const file = join(dir, `export-${i}.keymap`);
    writeFileSync(file, customSrc);
    utimesSync(file, new Date(2_000 + i * 1_000), new Date(2_000 + i * 1_000));
    watcher.change();
    t.mock.timers.tick(debounceMs - 1);
  }
  assert.equal(reloads, 0, "no reload while the burst is still arriving");

  t.mock.timers.tick(1); // the last event's debounce window closes
  assert.equal(reloads, 1, "the burst coalesced into one reload");

  t.mock.timers.tick(debounceMs * 10); // run any timer still queued
  assert.equal(reloads, 1, "no second reload fires after the burst");

  assert.equal(holder.getActiveFingerprint(), lastFingerprint);
  assert.notEqual(holder.getActiveFingerprint(), LAYOUT_FINGERPRINT, "a real keymap is now active");
  assert.ok(
    holder.getActiveKeymap()!.layers.some((l) => l.name === "Symbols"),
    "reloaded to the newest (custom) export",
  );
});

test("close() stops the watcher and drops a pending reload", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const dir = mkdtempSync(join(tmpdir(), "pocket-km-close-"));
  let reloads = 0;
  const watcher = manualWatcher();
  const holder = new KeymapHolder({
    dir,
    watch: true,
    debounceMs: 80,
    watchDir: watcher.watchDir,
    onReload: () => reloads++,
  });
  t.after(() => holder.close());

  writeFileSync(join(dir, "late.keymap"), customSrc);
  watcher.change(); // a reload is now pending
  holder.close();
  assert.ok(watcher.state.closed, "the watcher was closed");

  t.mock.timers.tick(80 * 10);
  assert.equal(reloads, 0, "the pending reload was cancelled by close()");
  assert.equal(holder.getActiveKeymap(), null, "the keymap that landed after close was not loaded");
});

test("fsWatchDir forwards fs.watch change events, swallows errors, and closes", async (t) => {
  // The production adapter, exercised on a real FSWatcher without waiting on the OS:
  // the test emits the watcher's events itself, so nothing races FSEvents/inotify
  // start-up and nothing can hang waiting for an event that never arrives.
  const dir = mkdtempSync(join(tmpdir(), "pocket-km-fswatch-"));
  let changes = 0;
  const watcher = fsWatchDir(dir, () => changes++) as FSWatcher;
  t.after(() => watcher.close());

  // fs.watch(dir, listener) registers `listener` for the watcher's "change" event.
  watcher.emit("change", "rename", "export.keymap");
  watcher.emit("change", "change", "export.keymap");
  assert.equal(changes, 2, "each fs.watch change event reaches onChange");

  // With no "error" listener, emit("error") would throw; fsWatchDir must have one.
  assert.doesNotThrow(() => watcher.emit("error", new Error("dir removed")));
  assert.equal(changes, 2, "an error is not reported as a change");

  // Node emits "close" in-process on the next tick once the handle is released.
  const closed = once(watcher, "close");
  watcher.close();
  await closed;
});
