// Build-time corpus curation. Reads a LOCAL WildChat-1M dump (gitignored) and
// emits data/seeds/prompts.json filtered to clean, single-turn, English, PII-free
// human prompts <=200 chars, capped at MAX_ITEMS. This never runs at runtime and
// never downloads anything — point it at a dump you already have on disk.
//
// Usage:
//   POCKET_WILDCHAT=/path/to/wildchat-1m.jsonl npm run curate
//
// Expected input: JSONL, one conversation record per line, each with a
// `conversation` array of { role, content, language? } turns (the WildChat-1M
// schema). We take the first human turn of each conversation.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, "../data/seeds/prompts.json");
const DUMP_PATH = process.env.POCKET_WILDCHAT ?? resolve(HERE, "../data/wildchat-1m.jsonl");

const MAX_ITEMS = 200;
const MAX_CHARS = 200;
const MIN_CHARS = 12;

// PII / unsafe content blocklist. Conservative: drop anything that looks like an
// email, URL, phone number, or hits a coarse NSFW keyword filter.
const PII_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/i, // email
  /https?:\/\//i, // url
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, // phone
  /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|blvd)\b/i, // street address
];
const NSFW_PATTERNS: RegExp[] =
  [/\bnsfw\b/i, /\bporn\b/i, /\bsex(ual|ually)?\b/i, /\bxxx\b/i, /\berotic\b/i];

interface Turn {
  role?: string;
  content?: string;
  language?: string;
}
interface Record {
  conversation?: Turn[];
  language?: string;
  toxic?: boolean;
  redacted?: boolean;
}

function isEnglish(text: string, declared?: string): boolean {
  if (declared) return declared.toLowerCase() === "english";
  // Heuristic fallback: mostly ASCII letters/punctuation.
  const ascii = text.replace(/[^\x20-\x7e]/g, "");
  return ascii.length / text.length > 0.95;
}

function isClean(text: string): boolean {
  if (PII_PATTERNS.some((re) => re.test(text))) return false;
  if (NSFW_PATTERNS.some((re) => re.test(text))) return false;
  return true;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function firstHumanPrompt(rec: Record): string | null {
  if (rec.toxic || rec.redacted) return null;
  const turn = rec.conversation?.find((t) => t.role === "user" && typeof t.content === "string");
  if (!turn?.content) return null;
  const text = normalize(turn.content);
  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return null;
  if (text.includes("\n")) return null; // single line
  if (!isEnglish(text, turn.language ?? rec.language)) return null;
  if (!isClean(text)) return null;
  return text;
}

function main(): void {
  if (!existsSync(DUMP_PATH)) {
    console.error(
      `curate-corpus: no WildChat dump at ${DUMP_PATH}.\n` +
        `Set POCKET_WILDCHAT to a local JSONL dump to regenerate the seed.\n` +
        `The committed data/seeds/prompts.json (honestly-labeled curated seed) is left untouched.`,
    );
    process.exit(1);
  }

  const lines = readFileSync(DUMP_PATH, "utf8").split("\n");
  const seen = new Set<string>();
  const items: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let rec: Record;
    try {
      rec = JSON.parse(line) as Record;
    } catch {
      continue;
    }
    const prompt = firstHumanPrompt(rec);
    if (!prompt) continue;
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(prompt);
    if (items.length >= MAX_ITEMS) break;
  }

  const payload = {
    context: "prompts",
    source: "WildChat-1M",
    license: "ODC-BY-1.0",
    note: `Curated from ${DUMP_PATH} on ${new Date().toISOString()}.`,
    items,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + "\n");
  console.log(`curate-corpus: wrote ${items.length} items to ${OUT_PATH}`);
}

main();
