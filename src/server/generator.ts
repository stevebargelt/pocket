import { containsBigram } from "../shared/bigrams";
import { GENERATED_LINE_COUNT, LAYOUT_FINGERPRINT, TOP_N_WEAK } from "../shared/constants";
import type { PracticeMode } from "../shared/types";
import { getCorpus, type CorpusItem } from "./corpus";
import { rankWeakBigrams } from "./weakness";
import type { Db } from "./db";

export interface GeneratedText {
  mode: PracticeMode;
  targetedBigrams: string[];
  lines: string[];
  text: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assemble(mode: PracticeMode, targetedBigrams: string[], items: CorpusItem[]): GeneratedText {
  const lines = items.map((i) => i.text);
  return { mode, targetedBigrams, lines, text: lines.join(" ") };
}

function randomText(corpus: CorpusItem[], count: number): GeneratedText {
  return assemble("random", [], shuffle(corpus).slice(0, count));
}

/**
 * Build practice text. In targeted mode, prefer corpus lines containing the
 * user's worst bigrams (weaker bigrams weighted higher). Falls back to a random
 * sample when untargeted, when no bigram has crossed the samples gate, or when
 * no corpus line happens to contain a weak bigram. Uses `containsBigram` so the
 * selection matches the engine's extraction exactly.
 */
export function generateText(
  db: Db,
  mode: PracticeMode,
  count: number = GENERATED_LINE_COUNT,
  fp: string = LAYOUT_FINGERPRINT,
): GeneratedText {
  const corpus = getCorpus(db, "prompts");
  if (corpus.length === 0) return { mode, targetedBigrams: [], lines: [], text: "" };

  if (mode === "targeted") {
    const weak = rankWeakBigrams(db, fp).slice(0, TOP_N_WEAK);
    if (weak.length > 0) {
      const weakUnits = weak.map((w) => w.unit);
      const weightOf = new Map(weak.map((w, i) => [w.unit, weak.length - i]));
      const scored = corpus
        .map((item) => ({
          item,
          score: weakUnits.reduce(
            (s, b) => s + (containsBigram(item.text, b) ? weightOf.get(b)! : 0),
            0,
          ),
        }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        return assemble("targeted", weakUnits, scored.slice(0, count).map((s) => s.item));
      }
    }
    return randomText(corpus, count);
  }

  return randomText(corpus, count);
}
