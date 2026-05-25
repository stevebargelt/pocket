// The active-keymap holder: a process singleton analogous to db.ts's getDb().
//
// It resolves the keymap path (POCKET_KEYMAP_PATH, else the newest *.keymap in
// <root>/keymaps/), parses it, and exposes getActiveKeymap()/getActiveFingerprint().
// When no keymap is present the keymap is null and the fingerprint falls back to
// the v1 sentinel — that is what keeps every pre-keymap-era code path (and the
// existing v1/v1.1 tests) working unchanged.
//
// It watches the DIRECTORY (not a single file): the MoErgo Layout Editor re-exports
// under a fresh UUID filename every time, so we re-pick the newest *.keymap on any
// change, debounced to coalesce the editor's temp-write+rename burst into one reload.

import { existsSync, readdirSync, statSync, watch as fsWatch, type FSWatcher } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYOUT_FINGERPRINT } from "../../shared/constants";
import { fingerprintKeymap } from "./fingerprint";
import { parseKeymapFile } from "./parser";
import type { Keymap } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Default keymap directory: <project root>/keymaps (gitignored — the user's own keymap). */
export const DEFAULT_KEYMAPS_DIR = resolve(HERE, "../../../keymaps");
/** Debounce window for the directory watcher (ms) — coalesces an editor write burst. */
export const DEFAULT_DEBOUNCE_MS = 200;

/** Called after a reload with the new active keymap (null when none) and fingerprint. */
export type OnReload = (keymap: Keymap | null, fingerprint: string) => void;

export interface KeymapHolderOptions {
  /** Directory to scan + watch for *.keymap files. */
  dir?: string | null;
  /** An explicit file to prefer while it exists (else the newest in `dir` is used). */
  pinnedFile?: string | null;
  /** Watcher debounce window in ms. */
  debounceMs?: number;
  /** Whether to attach an fs.watch on `dir`. Off in unit tests that drive reload() directly. */
  watch?: boolean;
  /** Invoked after every reload (not the initial load). */
  onReload?: OnReload;
}

/** The newest (by mtime) *.keymap file in `dir`, or null if the dir is missing/empty. */
export function newestKeymap(dir: string | null): string | null {
  if (!dir || !existsSync(dir)) return null;
  let newest: { path: string; mtime: number } | null = null;
  for (const name of readdirSync(dir)) {
    if (extname(name).toLowerCase() !== ".keymap") continue;
    const path = join(dir, name);
    let mtime: number;
    try {
      mtime = statSync(path).mtimeMs;
    } catch {
      continue; // file vanished between readdir and stat — skip it
    }
    if (!newest || mtime > newest.mtime) newest = { path, mtime };
  }
  return newest?.path ?? null;
}

/** Resolve the watch directory + optional pinned file from POCKET_KEYMAP_PATH / defaults. */
export function resolveSourceFromEnv(): { dir: string | null; pinnedFile: string | null } {
  const env = process.env.POCKET_KEYMAP_PATH;
  if (env) {
    try {
      const st = statSync(env);
      if (st.isFile()) return { dir: dirname(env), pinnedFile: env };
      if (st.isDirectory()) return { dir: env, pinnedFile: null };
    } catch {
      // configured but missing yet — watch its parent so it appears on first export.
    }
    return { dir: dirname(env), pinnedFile: null };
  }
  return { dir: DEFAULT_KEYMAPS_DIR, pinnedFile: null };
}

export class KeymapHolder {
  private readonly dir: string | null;
  private readonly pinnedFile: string | null;
  private readonly debounceMs: number;
  private readonly onReload?: OnReload;

  private keymap: Keymap | null = null;
  private fingerprint: string = LAYOUT_FINGERPRINT;
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: KeymapHolderOptions = {}) {
    this.dir = opts.dir ?? null;
    this.pinnedFile = opts.pinnedFile ?? null;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.onReload = opts.onReload;

    this.load(); // initial load — does NOT fire onReload
    if (opts.watch && this.dir) this.startWatch();
  }

  getActiveKeymap(): Keymap | null {
    return this.keymap;
  }

  getActiveFingerprint(): string {
    return this.fingerprint;
  }

  /** The file currently considered active, or null when none is present. */
  activeFile(): string | null {
    if (this.pinnedFile && existsSync(this.pinnedFile)) return this.pinnedFile;
    return newestKeymap(this.dir);
  }

  /** Re-resolve + re-parse the active file, then fire onReload. Safe to call repeatedly. */
  reload(): void {
    this.load();
    this.onReload?.(this.keymap, this.fingerprint);
  }

  private load(): void {
    const file = this.activeFile();
    if (!file) {
      this.keymap = null;
      this.fingerprint = LAYOUT_FINGERPRINT;
      return;
    }
    try {
      const keymap = parseKeymapFile(file);
      this.keymap = keymap;
      // An empty parse (no layers) is treated as "no usable keymap" → sentinel.
      this.fingerprint = keymap.layers.length > 0 ? fingerprintKeymap(keymap) : LAYOUT_FINGERPRINT;
    } catch {
      this.keymap = null;
      this.fingerprint = LAYOUT_FINGERPRINT;
    }
  }

  private startWatch(): void {
    if (!this.dir || !existsSync(this.dir)) return;
    this.watcher = fsWatch(this.dir, () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.reload();
      }, this.debounceMs);
    });
    this.watcher.on("error", () => {
      /* watcher errors (e.g. dir removed) are non-fatal — keep the last good keymap */
    });
  }

  /** Stop watching and clear any pending debounce. */
  close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

let singleton: KeymapHolder | null = null;

/**
 * (Re)initialise the process-wide holder. Closes any prior instance first so a
 * changed POCKET_KEYMAP_PATH (or a test-supplied dir) takes effect. `opts` override
 * the env-resolved source — pass `{ onReload }` at boot to wire DB persistence.
 */
export function initKeymapHolder(opts: KeymapHolderOptions = {}): KeymapHolder {
  if (singleton) singleton.close();
  const resolved = resolveSourceFromEnv();
  singleton = new KeymapHolder({
    dir: resolved.dir,
    pinnedFile: resolved.pinnedFile,
    watch: true,
    ...opts,
  });
  return singleton;
}

/** The process-wide holder, lazily created from the environment on first use. */
export function getKeymapHolder(): KeymapHolder {
  if (!singleton) initKeymapHolder();
  return singleton!;
}

/** Tear down the singleton (tests). */
export function resetKeymapHolder(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

export function getActiveKeymap(): Keymap | null {
  return getKeymapHolder().getActiveKeymap();
}

export function getActiveFingerprint(): string {
  return getKeymapHolder().getActiveFingerprint();
}
