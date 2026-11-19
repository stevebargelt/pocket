import { createApp } from "./app";
import { getDb } from "./db";
import { getCorpus, seedCorpus } from "./corpus";
import { initKeymapHolder, getActiveKeymap, getActiveFingerprint } from "./keymap/holder";
import { upsertLayout } from "./layouts";

const PORT = Number(process.env.PORT ?? 3000);

const db = getDb();

// Make `npm start` work without a manual seed step.
if (getCorpus(db, "prompts").length === 0) {
  const n = seedCorpus(db);
  console.log(`Pocket: seeded ${n} corpus items.`);
}

// v1.2: load the active ZMK keymap (POCKET_KEYMAP_PATH or the newest *.keymap in
// keymaps/), watch the directory for re-exports, and register every parsed layout
// in the `layouts` table. Persistence runs on the durable parse, so the live
// keymap display and the per-layout fingerprint stay in sync with the file.
function persistLayout(): void {
  const km = getActiveKeymap();
  const fp = getActiveFingerprint();
  if (km && km.layers.length > 0) upsertLayout(db, km, fp);
}

initKeymapHolder({
  onReload: () => {
    try {
      persistLayout();
    } catch (err) {
      // A bad re-export must not take the server down; keep serving the last good keymap.
      console.warn("Pocket: failed to persist reloaded keymap:", err);
    }
  },
});
persistLayout(); // initial registration for the keymap present at boot
if (getActiveKeymap()) {
  console.log(`Pocket: active keymap fingerprint ${getActiveFingerprint().slice(0, 12)}…`);
} else {
  console.log("Pocket: no keymap found — running without layer/thumb drills (HeatMap fallback).");
}

// Inject the real holder-backed keymap port (the router defaults to a no-keymap
// sentinel, which is what the tests rely on).
const app = createApp(db, { keymap: { getActiveKeymap, getActiveFingerprint } });

app.listen(PORT, () => {
  console.log(`Pocket running at http://localhost:${PORT}`);
});
