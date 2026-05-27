import { useCallback, useEffect, useState } from "react";
import type { PracticeMode } from "../shared/types";
import type { Context } from "../shared/constants";
import type { GeneratedText, Keymap, DrillText, LayerInfo } from "./api";
import { api } from "./api";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { RecommenderCard } from "./recommender/RecommenderCard";
import { ContextPicker } from "./session/ContextPicker";
import { LayerPicker, type LayerSelection } from "./session/LayerPicker";
import { KeymapView } from "./components/KeymapView";
import { TypingSurface, type SessionResult } from "./session/TypingSurface";
import { ResultsScreen } from "./session/ResultsScreen";
import { HistoryView } from "./history/HistoryView";

type View = "practice" | "history" | "settings";
type Phase = "idle" | "loading" | "typing" | "results";

const KEYMAP_SIG_KEY = "pocket.keymapSig";

/**
 * Cheap, stable, UI-only content hash of a parsed keymap (layer names + raw
 * binding tokens). This is NOT the server's SHA-256 fingerprint — it exists only
 * so the client can tell, across visits, that the user re-exported a *different*
 * layout and flag it in the live keymap display. Robust to server restarts
 * (identical content ⇒ identical hash ⇒ no false "changed" banner).
 */
function keymapSignature(km: Keymap): string {
  let h = 5381;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  };
  for (const layer of km.layers) {
    mix(layer.name);
    for (const b of layer.bindings) mix(b.raw);
  }
  return (h >>> 0).toString(16);
}

function hashToView(hash: string): View {
  if (hash === "#/history") return "history";
  if (hash === "#/settings") return "settings";
  return "practice";
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
        active
          ? "border border-accent bg-ink-surface text-ink-bright"
          : "border border-ink-border text-ink-muted hover:border-accent hover:text-ink-text"
      }`}
    >
      {children}
    </button>
  );
}

function SettingsView({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h2 className="text-lg text-ink-bright">Settings</h2>
      <label className="flex items-center justify-between">
        <span className="text-sm text-ink-text">Session length</span>
        <select
          value={settings.sessionSeconds}
          onChange={(e) => onChange({ ...settings, sessionSeconds: Number(e.target.value) })}
          className="rounded border border-ink-border bg-ink-surface px-2 py-1 text-sm"
        >
          <option value={30}>30 seconds</option>
          <option value={60}>60 seconds</option>
          <option value={120}>2 minutes</option>
          <option value={300}>5 minutes</option>
        </select>
      </label>
    </div>
  );
}

export default function App() {
  const [view, setViewState] = useState<View>(() => hashToView(window.location.hash));
  const [phase, setPhase] = useState<Phase>("idle");

  const setView = useCallback((v: View) => {
    setViewState(v);
    window.location.hash = `/${v}`;
  }, []);

  useEffect(() => {
    const onHashChange = () => setViewState(hashToView(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [selectedContext, setSelectedContext] = useState<Context>(() => settings.context);
  const [generated, setGenerated] = useState<GeneratedText | null>(null);
  const [mode, setMode] = useState<PracticeMode>("random");
  const [result, setResult] = useState<SessionResult | null>(null);

  // v1.2 keymap awareness.
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [keymapLoaded, setKeymapLoaded] = useState(false);
  const [viewedLayerIndex, setViewedLayerIndex] = useState(0);
  const [thumbSelected, setThumbSelected] = useState(false);
  const [fingerprintChanged, setFingerprintChanged] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [restrictToLayer, setRestrictToLayer] = useState(false);

  const startSession = useCallback(
    async (m: PracticeMode) => {
      setMode(m);
      setPhase("loading");
      const text = await api.text(m, selectedContext);
      setGenerated(text);
      setPhase("typing");
    },
    [selectedContext],
  );

  const refreshKeymap = useCallback(async () => {
    try {
      const [km, ls] = await Promise.all([api.keymap(), api.layers()]);
      setLayers(ls);
      setKeymap(km);
      setKeymapLoaded(true);
      if (km) {
        const sig = keymapSignature(km);
        const prev = localStorage.getItem(KEYMAP_SIG_KEY);
        setFingerprintChanged(prev !== null && prev !== sig);
        localStorage.setItem(KEYMAP_SIG_KEY, sig);
        // Keep the viewed layer in range if the layer count shrank on re-export.
        setViewedLayerIndex((i) => (i < km.layers.length ? i : 0));
      } else {
        setFingerprintChanged(false);
      }
    } catch {
      // No server / network error: behave as if no keymap (HeatMap fallback).
      setKeymap(null);
      setLayers([]);
      setKeymapLoaded(true);
    }
  }, []);

  // Load (and refresh) the active keymap whenever we land on the idle Practice
  // view. Refreshing on each return picks up a re-export the watcher reloaded
  // server-side without polling.
  useEffect(() => {
    if (view === "practice" && phase === "idle") void refreshKeymap();
  }, [view, phase, refreshKeymap]);

  const onLayerSelectionChange = useCallback((selection: LayerSelection) => {
    setDrillError(null);
    if (selection.kind === "thumb") {
      setThumbSelected(true);
    } else {
      setThumbSelected(false);
      setViewedLayerIndex(selection.index);
      if (selection.index === 0) setRestrictToLayer(false);
    }
  }, []);

  const startDrill = useCallback(async () => {
    setDrillError(null);
    setPhase("loading");
    try {
      const layerName = keymap?.layers[viewedLayerIndex]?.name;
      const drill: DrillText = thumbSelected
        ? await api.thumbDrill(layerName)
        : await api.layerDrill(layerName ?? "", selectedContext);
      if (!drill.drillable || drill.text.length === 0) {
        setDrillError(drill.reason ?? "this layer has no typeable keys to drill");
        setPhase("idle");
        return;
      }
      setMode(drill.mode);
      setGenerated(drill);
      setPhase("typing");
    } catch {
      setDrillError("couldn't load that drill — is the server running?");
      setPhase("idle");
    }
  }, [thumbSelected, keymap, viewedLayerIndex, selectedContext]);

  const onSettingsChange = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const onContextChange = useCallback((context: Context) => {
    setSelectedContext(context);
    setSettings((prev) => {
      const next = { ...prev, context };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleStart = useCallback(
    async (m: PracticeMode) => {
      if (restrictToLayer) {
        await startDrill();
      } else {
        await startSession(m);
      }
    },
    [restrictToLayer, startDrill, startSession],
  );

  const goPractice = useCallback(() => {
    setView("practice");
    setPhase("idle");
  }, [setView]);

  const selection: LayerSelection = thumbSelected
    ? { kind: "thumb" }
    : { kind: "layer", index: viewedLayerIndex };
  const viewedLayer = layers.find((l) => l.index === viewedLayerIndex);
  const canDrill = thumbSelected || (viewedLayer?.drillable ?? false);

  const showToggle = thumbSelected || viewedLayerIndex !== 0;
  const toggleDisabled = !canDrill;
  const toggleLabel = thumbSelected
    ? "Restrict to thumb cluster"
    : `Restrict to ${viewedLayer?.name ?? "layer"}`;
  const toggleTitle = toggleDisabled
    ? "this layer has no typeable keys to drill"
    : "Restrict practice to this layer only";

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b border-ink-border px-6 py-3">
        <div className="flex items-center gap-2">
          <svg role="img" aria-label="Pocket" height="28" viewBox="0.00 0.00 338.00 483.60" fill="none" className="text-ink-bright">
            <rect x="16.00" y="44.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="68.00" y="36.80" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="120.00" y="21.20" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="172.00" y="16.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="224.00" y="26.40" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="16.00" y="96.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="68.00" y="88.80" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="120.00" y="73.20" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="172.00" y="68.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="224.00" y="78.40" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="276.00" y="94.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="16.00" y="148.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="68.00" y="140.80" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="120.00" y="125.20" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="172.00" y="120.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="224.00" y="130.40" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="276.00" y="146.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="16.00" y="200.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="68.00" y="192.80" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="120.00" y="177.20" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="172.00" y="172.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="224.00" y="182.40" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="276.00" y="198.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="16.00" y="252.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="68.00" y="244.80" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="120.00" y="229.20" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="172.00" y="224.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="224.00" y="234.40" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="276.00" y="250.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="156.40" y="369.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="208.40" y="369.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="260.40" y="369.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="16.00" y="304.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="68.00" y="296.80" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="120.00" y="281.20" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="172.00" y="276.00" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="224.00" y="286.40" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="156.40" y="421.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="208.40" y="421.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
            <rect x="260.40" y="421.60" width="46" height="46" rx="7" ry="7" fill="none" stroke="currentColor" strokeWidth="5"/>
          </svg>
          <span className="text-lg font-semibold text-accent">Pocket</span>
          <span className="text-xs text-ink-muted">break in your Glove 80</span>
        </div>
        <nav className="flex gap-1">
          <NavButton active={view === "practice"} onClick={goPractice}>
            practice
          </NavButton>
          <NavButton active={view === "history"} onClick={() => setView("history")}>
            history
          </NavButton>
          <NavButton active={view === "settings"} onClick={() => setView("settings")}>
            settings
          </NavButton>
        </nav>
      </header>

      <main className="px-6 py-10">
        {view === "settings" && <SettingsView settings={settings} onChange={onSettingsChange} />}

        {view === "history" && <HistoryView keymap={keymap} />}

        {view === "practice" && (
          <>
            {phase === "idle" && (
              <div className="space-y-8">
                <ContextPicker value={selectedContext} onChange={onContextChange} />
                <RecommenderCard
                  onStart={handleStart}
                  context={selectedContext}
                  headerExtra={showToggle ? (
                    <label
                      htmlFor="restrict-to-layer"
                      className={`flex items-center gap-3 ${toggleDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <div className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          id="restrict-to-layer"
                          title={toggleTitle}
                          className="peer sr-only"
                          checked={restrictToLayer}
                          onChange={(e) => setRestrictToLayer(e.target.checked)}
                          disabled={toggleDisabled}
                        />
                        <div className="h-5 w-9 rounded-full bg-ink-border transition-colors peer-checked:bg-accent peer-disabled:opacity-40" />
                        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-ink-bg transition-transform peer-checked:translate-x-4" />
                      </div>
                      <span className={`text-sm ${toggleDisabled ? "text-ink-muted opacity-40" : "text-ink-text"}`}>
                        {toggleLabel}
                      </span>
                    </label>
                  ) : undefined}
                  extraContent={drillError ? (
                    <p role="alert" className="mt-2 text-sm text-err">
                      {drillError}
                    </p>
                  ) : undefined}
                />

                {keymap ? (
                  <section className="flex flex-col items-center gap-4">
                    <LayerPicker
                      layers={layers}
                      value={selection}
                      onChange={onLayerSelectionChange}
                    />
                    <KeymapView
                      keymap={keymap}
                      activeLayerIndex={viewedLayerIndex}
                      fingerprintChanged={fingerprintChanged}
                      updatedAt={keymap.parsedAt}
                    />
                  </section>
                ) : (
                  keymapLoaded && (
                    <section className="flex flex-col items-center gap-2">
                      <p className="max-w-md text-center text-xs text-ink-muted">
                        No ZMK keymap loaded. Drop a{" "}
                        <span className="font-mono">.keymap</span> file in{" "}
                        <span className="font-mono">keymaps/</span> (or set{" "}
                        <span className="font-mono">POCKET_KEYMAP_PATH</span>) to see your real
                        Glove 80 layout and unlock layer &amp; thumb-cluster drills.
                      </p>
                    </section>
                  )
                )}
              </div>
            )}
            {phase === "loading" && <p className="text-center text-ink-muted">loading prompts…</p>}
            {phase === "typing" && generated && (
              <TypingSurface
                text={generated.text}
                durationSeconds={settings.sessionSeconds}
                onComplete={(r) => {
                  setResult(r);
                  setPhase("results");
                }}
              />
            )}
            {phase === "results" && result && generated && (
              <ResultsScreen
                result={result}
                mode={mode}
                context={selectedContext}
                targetSeconds={settings.sessionSeconds}
                targetChars={generated.text.length}
                keymap={keymap}
                onAgain={() => setPhase("idle")}
                onViewHistory={() => setView("history")}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
