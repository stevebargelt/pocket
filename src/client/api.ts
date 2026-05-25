import type {
  HistoryEntry,
  PracticeMode,
  Recommendation,
  SessionPayload,
  SessionRow,
} from "../shared/types";
import type { Context } from "../shared/constants";
import type { GeneratedText } from "../server/generator";
// v1.2 keymap engine types. Type-only imports (erased at build) so the client
// bundle never pulls the server's runtime keymap/drill code — same pattern the
// existing GeneratedText import above already relies on.
import type { Keymap } from "../server/keymap/types";
import type { LayerDrill } from "../server/drills/layerDrills";
import type { ThumbDrill } from "../server/drills/thumbDrills";

/** One entry from GET /api/layers: a parsed layer plus whether it can be drilled. */
export interface LayerInfo {
  name: string;
  index: number;
  /** False ⇒ the layer binds no typeable keys (e.g. an all-bluetooth/RGB layer). */
  drillable: boolean;
}

/** GET /api/drill returns a layer- or thumb-focused drill (both extend GeneratedText). */
export type DrillText = LayerDrill | ThumbDrill;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  text: (mode: PracticeMode, context: Context) =>
    getJson<GeneratedText>(`/api/text?mode=${mode}&context=${context}`),
  history: () => getJson<HistoryEntry[]>("/api/history"),
  recommendation: () => getJson<Recommendation>("/api/recommendation"),
  /** The parsed active ZMK keymap, or null when no .keymap file is configured. */
  keymap: () => getJson<Keymap | null>("/api/keymap"),
  /** Parsed layer names with their drillable flags ([] when no keymap). */
  layers: () => getJson<LayerInfo[]>("/api/layers"),
  /** Practice text for a single layer (only the characters that layer binds). */
  layerDrill: (layer: string, context: Context) =>
    getJson<LayerDrill>(
      `/api/drill?focus=layer&layer=${encodeURIComponent(layer)}&context=${context}`,
    ),
  /** Thumb-cluster drill text (defaults to the base layer's thumb keys). */
  thumbDrill: (layer?: string) =>
    getJson<ThumbDrill>(
      `/api/drill?focus=thumb${layer ? `&layer=${encodeURIComponent(layer)}` : ""}`,
    ),
  async saveSession(payload: SessionPayload): Promise<SessionRow> {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`POST /api/session failed: ${res.status}`);
    return res.json() as Promise<SessionRow>;
  },
};

export type { GeneratedText, Keymap, LayerDrill, ThumbDrill };
