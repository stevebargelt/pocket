// Build-time code corpus curation. Reads LOCAL permissive-license OSS checkouts
// (gitignored) and emits one seed file per language under data/seeds/, all in the
// 'code' context. This never runs at runtime and never downloads anything — drop
// checkouts into data/code-raw/<lang>/ yourself first:
//
//   data/code-raw/typescript/   (e.g. an Express checkout, MIT)
//   data/code-raw/python/       (e.g. a FastAPI checkout, MIT)
//   data/code-raw/bash/         (e.g. an MIT-licensed shell project)
//   npm run curate:code
//
// Adding a language is just another LANGS entry pointing at a new subdir. Each
// language keeps single, self-contained source lines within the code cap. When a
// checkout is absent that language is skipped and its committed seed is left
// untouched. Update each entry's source/license to match what you curate.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS_LINE_CAPS } from "../src/shared/constants";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = process.env.POCKET_CODE ?? resolve(HERE, "../data/code-raw");
const SEEDS_DIR = resolve(HERE, "../data/seeds");

const { min: MIN_CHARS, max: MAX_CHARS } = CORPUS_LINE_CAPS.code;
const MAX_ITEMS = 50;

interface Lang {
  dir: string;
  ext: string;
  out: string;
  source: string;
  license: string;
}

const LANGS: Lang[] = [
  { dir: "typescript", ext: ".ts", out: "code-typescript.json", source: "Express (curated TypeScript seed)", license: "MIT" },
  { dir: "python", ext: ".py", out: "code-python.json", source: "FastAPI (curated Python seed)", license: "MIT" },
  { dir: "bash", ext: ".sh", out: "code-bash.json", source: "Pocket (hand-authored)", license: "MIT" },
];

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext));
    else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function curateLang(lang: Lang): number {
  const langDir = join(RAW_DIR, lang.dir);
  if (!existsSync(langDir)) {
    console.warn(`curate-code: no ${lang.dir} checkout at ${langDir}; skipping (seed left untouched).`);
    return 0;
  }
  const seen = new Set<string>();
  const items: string[] = [];
  for (const file of walk(langDir, lang.ext)) {
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const line = raw.replace(/\s+$/, ""); // keep leading indent, drop trailing ws
      const trimmed = line.trim();
      if (trimmed.length < MIN_CHARS || line.length > MAX_CHARS) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(line);
      if (items.length >= MAX_ITEMS) break;
    }
    if (items.length >= MAX_ITEMS) break;
  }
  const payload = {
    context: "code",
    source: lang.source,
    license: lang.license,
    note: `Curated from ${langDir} on ${new Date().toISOString()}. See CREDITS.md.`,
    items,
  };
  writeFileSync(join(SEEDS_DIR, lang.out), JSON.stringify(payload, null, 2) + "\n");
  console.log(`curate-code: wrote ${items.length} ${lang.dir} items to ${lang.out}`);
  return items.length;
}

function main(): void {
  if (!existsSync(RAW_DIR)) {
    console.error(
      `curate-code: no checkouts at ${RAW_DIR}.\n` +
        `  Create data/code-raw/{typescript,python,bash}/ from permissive-license OSS\n` +
        `then re-run. Never downloads. The committed data/seeds/code-*.json are left untouched.`,
    );
    process.exit(1);
  }
  let total = 0;
  for (const lang of LANGS) total += curateLang(lang);
  console.log(`curate-code: ${total} lines total across ${LANGS.length} languages.`);
}

main();
