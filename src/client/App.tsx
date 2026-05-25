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
import { HeatMap } from "./components/HeatMap";
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
      className={`rounded px-3 py-1 text-sm ${
        active ? "bg-ink-surface text-ink-bright" : "text-ink-muted hover:text-ink-text"
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
  const [view, setView] = useState<View>("practice");
  const [phase, setPhase] = useState<Phase>("idle");
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

  const goPractice = useCallback(() => {
    setView("practice");
    setPhase("idle");
  }, []);

  const selection: LayerSelection = thumbSelected
    ? { kind: "thumb" }
    : { kind: "layer", index: viewedLayerIndex };
  const viewedLayer = layers.find((l) => l.index === viewedLayerIndex);
  const canDrill = thumbSelected || (viewedLayer?.drillable ?? false);
  const drillButtonLabel = thumbSelected
    ? "start thumb-cluster drill"
    : viewedLayer
      ? `start ${viewedLayer.name} drill`
      : "start layer drill";

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

        {view === "history" && <HistoryView />}

        {view === "practice" && (
          <>
            {phase === "idle" && (
              <div className="space-y-8">
                {keymap ? (
                  <section className="flex flex-col items-center gap-4">
                    <KeymapView
                      keymap={keymap}
                      activeLayerIndex={viewedLayerIndex}
                      fingerprintChanged={fingerprintChanged}
                      updatedAt={keymap.parsedAt}
                    />
                    <LayerPicker
                      layers={layers}
                      value={selection}
                      onChange={onLayerSelectionChange}
                    />
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={startDrill}
                        disabled={!canDrill}
                        title={
                          canDrill ? undefined : "this layer binds no typeable keys to drill"
                        }
                        className="rounded bg-accent px-4 py-2 font-semibold text-ink-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {drillButtonLabel}
                      </button>
                      {drillError && (
                        <p role="alert" className="text-sm text-err">
                          {drillError}
                        </p>
                      )}
                    </div>
                  </section>
                ) : (
                  keymapLoaded && (
                    <section className="flex flex-col items-center gap-2">
                      <HeatMap keyStats={[]} showToggle={false} />
                      <p className="max-w-md text-center text-xs text-ink-muted">
                        No ZMK keymap loaded — showing a generic layout. Drop a{" "}
                        <span className="font-mono">.keymap</span> file in{" "}
                        <span className="font-mono">keymaps/</span> (or set{" "}
                        <span className="font-mono">POCKET_KEYMAP_PATH</span>) to see your real
                        Glove 80 layout and unlock layer &amp; thumb-cluster drills.
                      </p>
                    </section>
                  )
                )}

                <div className="border-t border-ink-border pt-8">
                  <ContextPicker value={selectedContext} onChange={onContextChange} />
                  <RecommenderCard onStart={startSession} context={selectedContext} />
                </div>
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
