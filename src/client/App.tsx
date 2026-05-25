import { useCallback, useState } from "react";
import type { PracticeMode } from "../shared/types";
import type { Context } from "../shared/constants";
import type { GeneratedText } from "./api";
import { api } from "./api";
import { loadSettings, saveSettings, type Settings, type Theme } from "./settings";
import { RecommenderCard } from "./recommender/RecommenderCard";
import { ContextPicker } from "./session/ContextPicker";
import { TypingSurface, type SessionResult } from "./session/TypingSurface";
import { ResultsScreen } from "./session/ResultsScreen";
import { HistoryView } from "./history/HistoryView";

type View = "practice" | "history" | "settings";
type Phase = "idle" | "loading" | "typing" | "results";

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
      <label className="flex items-center justify-between">
        <span className="text-sm text-ink-text">Theme</span>
        <select
          value={settings.theme}
          onChange={(e) => onChange({ ...settings, theme: e.target.value as Theme })}
          className="rounded border border-ink-border bg-ink-surface px-2 py-1 text-sm"
        >
          <option value="dark">dark</option>
          <option value="light">light</option>
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

  return (
    <div className="min-h-full">
      <header className="flex items-center justify-between border-b border-ink-border px-6 py-3">
        <div className="flex items-baseline gap-2">
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
              <>
                <ContextPicker value={selectedContext} onChange={onContextChange} />
                <RecommenderCard onStart={startSession} context={selectedContext} />
              </>
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
