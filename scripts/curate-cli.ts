// Build-time CLI corpus curation. Reads a LOCAL tldr-pages checkout (gitignored)
// and emits data/seeds/cli-tldr.json: short example command lines pulled from the
// tldr markdown pages, attributed to tldr-pages (CC-BY-4.0). This never runs at
// runtime and never downloads anything — clone tldr-pages yourself first:
//
//   git clone https://github.com/tldr-pages/tldr data/tldr-raw
//   npm run curate:cli
//
// tldr puts each example command on a backtick-wrapped line, with {{placeholder}}
// tokens we flatten to their inner text. nl2bash is deliberately NOT used: its
// research/non-commercial license conflicts with shipping data inside this MIT
// repo (see data/PROVENANCE.md). When no checkout is present the committed,
// honestly-labeled data/seeds/cli-tldr.json is left untouched.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS_LINE_CAPS } from "../src/shared/constants";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = process.env.POCKET_TLDR ?? resolve(HERE, "../data/tldr-raw");
const OUT_PATH = resolve(HERE, "../data/seeds/cli-tldr.json");

const { min: MIN_CHARS, max: MAX_CHARS } = CORPUS_LINE_CAPS.cli;
const MAX_ITEMS = 120;

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext));
    else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function exampleLines(md: string): string[] {
  const out: string[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    // The backtick-wrapped lines are the commands; the `-` lines are descriptions.
    if (!line.startsWith("`") || !line.endsWith("`") || line.length < 3) continue;
    const cmd = line
      .slice(1, -1)
      .replace(/\{\{(.*?)\}\}/g, "$1") // {{placeholder}} -> placeholder
      .replace(/\s+/g, " ")
      .trim();
    out.push(cmd);
  }
  return out;
}

function main(): void {
  if (!existsSync(RAW_DIR)) {
    console.error(
      `curate-cli: no tldr-pages checkout at ${RAW_DIR}.\n` +
        `  git clone https://github.com/tldr-pages/tldr data/tldr-raw\n` +
        `then re-run. Never downloads. The committed data/seeds/cli-tldr.json is left untouched.`,
    );
    process.exit(1);
  }

  const seen = new Set<string>();
  const items: string[] = [];
  for (const file of walk(RAW_DIR, ".md")) {
    for (const cmd of exampleLines(readFileSync(file, "utf8"))) {
      if (cmd.length < MIN_CHARS || cmd.length > MAX_CHARS) continue;
      const key = cmd.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(cmd);
      if (items.length >= MAX_ITEMS) break;
    }
    if (items.length >= MAX_ITEMS) break;
  }

  const payload = {
    context: "cli",
    source: "tldr-pages",
    license: "CC-BY-4.0",
    note: `Curated from ${RAW_DIR} on ${new Date().toISOString()}. tldr-pages is CC-BY-4.0; see CREDITS.md.`,
    items,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + "\n");
  console.log(`curate-cli: wrote ${items.length} items to ${OUT_PATH}`);
}

main();
