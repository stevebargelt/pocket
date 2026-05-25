// Layer drills (PRD §5 v1.2). Generate practice text focused on a SINGLE parsed
// layer, using only the typeable characters that layer binds.
//
// PURITY: this module is a pure function over a parsed keymap. It imports no DB
// and no holder; the caller (routes, step 4) fetches the corpus (getCorpus) and
// the ranked weak bigrams (rankWeakBigrams) and passes them in. That keeps the
// generator unit-testable from a hand-built keymap literal and mirrors the
// targeted->random selection shape of generator.ts.
//
// KEYCODE RESOLUTION + KEYMAP CONTRACT live here temporarily. The step-2 keymap
// engine (src/server/keymap/) owns the canonical Keymap types and the single
// keycode->glyph/char table; until that lands, the drills carry the minimal
// subset they need. The consumed shapes below are intentionally minimal so a
// richer step-2 Keymap is structurally assignable to these functions.

import { containsBigram } from "../../shared/bigrams";
import { GENERATED_LINE_COUNT } from "../../shared/constants";
import type { PracticeMode } from "../../shared/types";
import type { GeneratedText } from "../generator";

// ── Consumed keymap contract (minimal projection of step-2's parsed Keymap) ──

/**
 * One parsed binding: the ZMK behavior token (after `&`) plus its params. This
 * is a minimal projection — the step-2 parser's richer Binding (which also
 * carries `raw`/`known`/`glyph`/`char`) is structurally assignable here. When
 * `char`/`glyph` are present (production), the drills prefer them so they stay
 * consistent with the parser's single keycode table; in hand-built test keymaps
 * they're absent and the drills fall back to the local `keycodeToChar`.
 */
export interface Binding {
  /** `kp`, `mo`, `to`, `tog`, `lt`, `mt`, `trans`, or an unknown/raw token. */
  behavior: string;
  /** Remaining tokens, e.g. ["LS(N9)"], ["2", "SPACE"], or []. */
  params: string[];
  /** Pre-resolved typed character from the step-2 parser, or null; optional. */
  char?: string | null;
  /** Pre-resolved display glyph from the step-2 parser; optional. */
  glyph?: string;
}

/** One layer: a name plus its ordered bindings (80 for a Glove 80 layer). */
export interface Layer {
  name: string;
  bindings: Binding[];
}

/** A parsed keymap: an ordered list of layers. */
export interface Keymap {
  layers: Layer[];
}

// ── Keycode resolution (typeable character + display glyph) ──

/** Mac modifier glyphs. Shared with thumb drills; the SVG (step 2/5) owns the
 *  canonical table — this is the subset the drills need to label thumb keys. */
export const MOD_GLYPHS: Record<string, string> = {
  LGUI: "⌘", RGUI: "⌘", LMETA: "⌘", RMETA: "⌘", LCMD: "⌘", RCMD: "⌘",
  LALT: "⌥", RALT: "⌥", LOPT: "⌥", ROPT: "⌥",
  LCTRL: "⌃", RCTRL: "⌃", LCTL: "⌃", RCTL: "⌃",
  LSHFT: "⇧", RSHFT: "⇧", LSHIFT: "⇧", RSHIFT: "⇧",
};

const SHIFTED_NUMBER: Record<string, string> = {
  N0: ")", N1: "!", N2: "@", N3: "#", N4: "$",
  N5: "%", N6: "^", N7: "&", N8: "*", N9: "(",
};

const SHIFTED_SYMBOL: Record<string, string> = {
  SEMI: ":", EQUAL: "+", MINUS: "_", COMMA: "<", DOT: ">",
  FSLH: "?", SQT: '"', GRAVE: "~", LBKT: "{", RBKT: "}", BSLH: "|",
};

const PUNCT: Record<string, string> = {
  SPACE: " ",
  SEMI: ";", SEMICOLON: ";",
  SQT: "'", APOS: "'", APOSTROPHE: "'", SINGLE_QUOTE: "'",
  GRAVE: "`",
  COMMA: ",",
  DOT: ".", PERIOD: ".",
  FSLH: "/", SLASH: "/",
  BSLH: "\\", BACKSLASH: "\\", NON_US_BSLH: "\\",
  LBKT: "[", LEFT_BRACKET: "[",
  RBKT: "]", RIGHT_BRACKET: "]",
  EQUAL: "=",
  MINUS: "-",
  KP_SLASH: "/", KP_DIVIDE: "/",
  KP_MULTIPLY: "*", KP_ASTERISK: "*",
  KP_MINUS: "-", KP_SUBTRACT: "-",
  KP_PLUS: "+", KP_PLUS_AND_EQUAL: "+",
  KP_EQUAL: "=",
  KP_DOT: ".",
  KP_COMMA: ",",
};

function unshiftedChar(code: string): string | null {
  if (/^[A-Z]$/.test(code)) return code.toLowerCase();
  if (/^N[0-9]$/.test(code)) return code.slice(1);
  if (/^NUMBER_[0-9]$/.test(code)) return code.slice(7);
  if (/^KP_N[0-9]$/.test(code)) return code.slice(4);
  return PUNCT[code] ?? null;
}

function shiftedChar(code: string): string | null {
  if (/^[A-Z]$/.test(code)) return code; // uppercase letter
  return SHIFTED_NUMBER[code] ?? SHIFTED_SYMBOL[code] ?? null;
}

/**
 * Resolve a ZMK keycode token to the literal character it produces, or null if
 * it isn't a single typeable character (modifiers, layer keys, F-keys, media,
 * Enter/Tab/Backspace — none of which reach the typing surface as an expected
 * character). Handles the shift wrapper LS(..)/RS(..) and keypad codes.
 */
export function keycodeToChar(token: string): string | null {
  const shift = /^[LR]S\((.+)\)$/.exec(token);
  if (shift) return shiftedChar(shift[1]);
  return unshiftedChar(token);
}

/** Display glyph for a typed character (space rendered visibly). */
export function glyphForChar(ch: string): string {
  return ch === " " ? "␣" : ch;
}

/**
 * The character a binding produces that is actually SCORABLE through the typing
 * surface, or null. Prefers the step-2 parser's resolved `char` (broad keycode
 * coverage), falling back to the local resolver for &kp in hand-built keymaps.
 * Filters out characters the capture layer never delivers as an expected
 * keystroke: Enter ("\n") and Tab ("\t") are dropped by useKeystrokeCapture, and
 * Backspace is a correction — only printable single characters (space included)
 * are scorable.
 */
export function scorableChar(b: Binding): string | null {
  const raw =
    b.char !== undefined ? b.char : b.behavior === "kp" ? keycodeToChar(b.params[0] ?? "") : null;
  if (raw === null) return null;
  if (raw.length !== 1) return null;
  if (raw === "\n" || raw === "\t" || raw === "\r") return null;
  return raw;
}

// ── Weak-bigram-weighted line selection (mirrors generator.ts) ──

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Selection {
  mode: PracticeMode;
  targetedBigrams: string[];
  lines: string[];
}

/**
 * Pick up to `count` lines from `candidates`. In targeted mode, prefer lines
 * containing the user's worst bigrams (weaker = higher weight), exactly as
 * generator.ts does via `containsBigram`. Falls back to a random sample when no
 * weak bigram is supplied or none of the candidates contains one.
 */
export function selectLines(candidates: string[], weakBigrams: string[], count: number): Selection {
  const pool = candidates.filter((l) => l.length > 0);
  if (pool.length === 0) return { mode: "random", targetedBigrams: [], lines: [] };

  if (weakBigrams.length > 0) {
    const weightOf = new Map(weakBigrams.map((b, i) => [b, weakBigrams.length - i]));
    const scored = pool
      .map((line) => ({
        line,
        score: weakBigrams.reduce(
          (s, b) => s + (containsBigram(line, b) ? weightOf.get(b)! : 0),
          0,
        ),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) {
      const lines = scored.slice(0, count).map((s) => s.line);
      const targetedBigrams = weakBigrams.filter((b) => lines.some((l) => containsBigram(l, b)));
      return { mode: "targeted", targetedBigrams, lines };
    }
  }
  return { mode: "random", targetedBigrams: [], lines: shuffle(pool).slice(0, count) };
}

// ── Curated layer seeds (MIT, Pocket-authored — see CREDITS / data/PROVENANCE) ──
//
// Symbol-/number-heavy lines that exercise non-base layers. Each is filtered at
// generation time so it survives only when every non-space character is bound on
// the selected layer — so a symbol layer gets symbol lines, a number/keypad
// layer gets number lines, and nothing leaks a character the layer can't type.

const LAYER_SEEDS: string[] = [
  // brackets & grouping
  "()()()", "( ( ) )", "(())", "[ ]", "[][]", "[[ ]]", "{ }", "{}{}",
  "<>", "< >", "([{}])", "{[()]}", "(()) [[]] {{}}",
  // math & assignment
  "1 + 1", "2 - 1", "3 * 4", "8 / 2", "5 % 2", "1 + 2 = 3", "9 - 4 = 5",
  "2 * 3 = 6", "8 / 4 = 2", "= = =", "+ - * /", "10 + 20 = 30",
  // numbers / keypad
  "0 1 2 3 4 5 6 7 8 9", "12 34 56 78 90", "100 200 300", "0.5 1.5 2.5",
  "1, 2, 3", "9 8 7 6 5", "3.14 2.72",
  // punctuation runs
  ". , . ,", "; ; ;", "/ / /", "% % %", "* * *", "+ + +", "- - -",
];

// ── Layer drill result ──

export interface LayerDrill extends GeneratedText {
  focus: "layer";
  layer: string;
  /** False => the layer binds no typeable characters; lines/text are empty. */
  drillable: boolean;
  /** Why the layer is not drillable (null when it is). */
  reason: string | null;
  /** The sorted, unique typeable characters the layer binds (space excluded). */
  chars: string[];
}

export interface LayerDrillOptions {
  /** Candidate corpus lines (routes passes getCorpus(db, ctx).map(c => c.text)). */
  corpus?: string[];
  /** Ranked weak-bigram units (routes passes rankWeakBigrams(db, fp).map(w => w.unit)). */
  weakBigrams?: string[];
  /** How many lines to assemble. */
  lineCount?: number;
}

/** Build short space-separated sequences straight from a layer's characters.
 *  The non-empty safety net: a drillable layer never yields empty text even when
 *  no curated or corpus line happens to fit. */
function synthLines(chars: string[], count: number): string[] {
  if (chars.length === 0) return [];
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const tokens: string[] = [];
    for (let t = 0; t < 6; t++) {
      const a = chars[Math.floor(Math.random() * chars.length)];
      const b = chars[Math.floor(Math.random() * chars.length)];
      tokens.push(a + b);
    }
    lines.push(tokens.join(" "));
  }
  return lines;
}

/**
 * Generate a layer drill for `layerName`. Returns an explicit, flagged empty
 * result (drillable=false, reason set) for a layer with no typeable bindings —
 * never an empty string with no explanation, never a crash. Hybrid corpus:
 * curated symbol/number seeds plus weak-bigram-weighted corpus lines, both
 * filtered to characters the layer actually binds.
 */
export function generateLayerDrill(
  keymap: Keymap,
  layerName: string,
  opts: LayerDrillOptions = {},
): LayerDrill {
  const lineCount = opts.lineCount ?? GENERATED_LINE_COUNT;
  const flagged = (reason: string): LayerDrill => ({
    focus: "layer",
    layer: layerName,
    drillable: false,
    reason,
    chars: [],
    mode: "random",
    targetedBigrams: [],
    lines: [],
    text: "",
  });

  const layer = keymap.layers.find((l) => l.name === layerName);
  if (!layer) return flagged(`layer "${layerName}" not found`);

  // Collect the layer's scorable characters. Space is allowed inside generated
  // text as a separator but is not itself a "drillable character".
  const charSet = new Set<string>();
  for (const b of layer.bindings) {
    const ch = scorableChar(b);
    if (ch !== null && ch !== " ") charSet.add(ch);
  }
  if (charSet.size === 0) return flagged("no typeable keys bound on this layer");

  const allowed = new Set(charSet);
  allowed.add(" ");
  const fits = (line: string) => Array.from(line).every((c) => allowed.has(c));

  const chars = Array.from(charSet).sort();
  const curated = LAYER_SEEDS.filter(fits);
  const corpusLines = (opts.corpus ?? []).filter(fits);
  const weak = (opts.weakBigrams ?? []).filter((b) => Array.from(b).every((c) => allowed.has(c)));

  // Prefer real corpus text; fall back to curated so symbol/number layers (whose
  // prose intersection is empty) still produce on-layer practice.
  const candidates = [...corpusLines, ...curated];
  let sel = selectLines(candidates, weak, lineCount);
  if (sel.lines.length === 0) {
    sel = { mode: "random", targetedBigrams: [], lines: synthLines(chars, lineCount) };
  }

  return {
    focus: "layer",
    layer: layerName,
    drillable: true,
    reason: null,
    chars,
    mode: sel.mode,
    targetedBigrams: sel.targetedBigrams,
    lines: sel.lines,
    text: sel.lines.join(" "),
  };
}
