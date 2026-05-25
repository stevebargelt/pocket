import type {
  HistoryEntry,
  PracticeMode,
  Recommendation,
  SessionPayload,
  SessionRow,
} from "../shared/types";
import type { GeneratedText } from "../server/generator";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  text: (mode: PracticeMode) => getJson<GeneratedText>(`/api/text?mode=${mode}`),
  history: () => getJson<HistoryEntry[]>("/api/history"),
  recommendation: () => getJson<Recommendation>("/api/recommendation"),
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

export type { GeneratedText };
