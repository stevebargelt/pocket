// Thumb-cluster drills (PRD §5 v1.2). The Glove 80's thumb keys are the
// documented #1 adaptation pain point: 6 keys per hand (indices 52-57 and
// 69-74). This drill targets them directly rather than reusing the prose corpus.
//
// OBSERVABILITY (architect decision D6): only outcomes that reach the typing
// surface as a length-1 character can be SCORED. On the thumb cluster that is
// space and any typeable symbol the keymap binds there. Pure modifiers, layer
// toggles (&mo/&lt/&to/&tog), Backspace, Delete and Enter never arrive as an
// expected character (modifiers/layers don't reach the DOM; Backspace is a
// correction; Enter is dropped by the capture filter), so they are returned as
// labeled guided/unscored metadata for the live keymap to display — not woven
// into the scored text.
//
// PURITY: like layerDrills, this is a pure function over a parsed keymap; the
// caller supplies the ranked weak bigrams.

import { GENERATED_LINE_COUNT } from "../../shared/constants";
import type { GeneratedText } from "../generator";
import {
  type Keymap,
  type Binding,
  MOD_GLYPHS,
  scorableChar,
  glyphForChar,
  selectLines,
} from "./layerDrills";

/** The 12 thumb-cluster key positions, in keymap-binding index order. */
export const THUMB_INDICES = [52, 53, 54, 55, 56, 57, 69, 70, 71, 72, 73, 74] as const;

const THUMB_POSITIONS: Record<number, { hand: "L" | "R"; position: string }> = {
  52: { hand: "L", position: "LH_T1" },
  53: { hand: "L", position: "LH_T2" },
  54: { hand: "L", position: "LH_T3" },
  55: { hand: "R", position: "RH_T3" },
  56: { hand: "R", position: "RH_T2" },
  57: { hand: "R", position: "RH_T1" },
  69: { hand: "L", position: "LH_T4" },
  70: { hand: "L", position: "LH_T5" },
  71: { hand: "L", position: "LH_T6" },
  72: { hand: "R", position: "RH_T6" },
  73: { hand: "R", position: "RH_T5" },
  74: { hand: "R", position: "RH_T4" },
};

const LAYER_BEHAVIORS = new Set(["mo", "lt", "to", "tog", "sl"]);
const CORRECTION_CODES = new Set(["BSPC", "BACKSPACE"]);
const DELETE_CODES = new Set(["DEL", "DELETE"]);
const ENTER_CODES = new Set(["RET", "RETURN", "ENTER", "KP_ENTER"]);

/** How a thumb key behaves with respect to scoring. */
export type ThumbKeyClass = "typed" | "correction" | "enter" | "modifier" | "layer" | "other";

/** A single thumb-cluster key, labeled for the live keymap display. */
export interface ThumbKeyInfo {
  index: number;
  hand: "L" | "R";
  position: string;
  behavior: string;
  /** Display glyph: the typed char, a Mac mod glyph, ⌫/⌦/⏎, or a layer label. */
  glyph: string;
  class: ThumbKeyClass;
  /** True only for `typed` keys — the ones the drill text scores. */
  scored: boolean;
  /** The literal character, for `typed` keys; null otherwise. */
  char: string | null;
}

export interface ThumbDrill extends GeneratedText {
  focus: "thumb";
  /** False => no scorable thumb outcome (all modifiers/layers); text is empty. */
  drillable: boolean;
  reason: string | null;
  /** The scorable thumb characters (space and any typeable symbols). */
  typedChars: string[];
  /** All present thumb keys, labeled (the guided cluster the UI renders). */
  keys: ThumbKeyInfo[];
  /** The subset of `keys` that is observed/guided but not scored. */
  guided: ThumbKeyInfo[];
}

export interface ThumbDrillOptions {
  /** Ranked weak-bigram units (routes passes rankWeakBigrams(db, fp).map(w => w.unit)). */
  weakBigrams?: string[];
  lineCount?: number;
}

function classify(index: number, b: Binding): ThumbKeyInfo {
  const pos = THUMB_POSITIONS[index];
  const base = { index, hand: pos.hand, position: pos.position, behavior: b.behavior };
  const code = b.params[0] ?? "";
  // Prefer the step-2 parser's resolved glyph (consistent with the SVG); fall
  // back to a computed glyph for hand-built test keymaps.
  const g = (computed: string) => b.glyph ?? computed;

  // Scorable typed outcome: space or a typeable symbol that survives the capture
  // filter (Enter/Tab already excluded by scorableChar).
  const ch = scorableChar(b);
  if (ch !== null) {
    return { ...base, glyph: g(glyphForChar(ch)), class: "typed", scored: true, char: ch };
  }
  if (b.behavior === "kp" && code in MOD_GLYPHS) {
    return { ...base, glyph: g(MOD_GLYPHS[code]), class: "modifier", scored: false, char: null };
  }
  if (LAYER_BEHAVIORS.has(b.behavior)) {
    return {
      ...base,
      glyph: g(`${b.behavior} ${b.params.join(" ")}`.trim()),
      class: "layer",
      scored: false,
      char: null,
    };
  }
  if (b.behavior === "kp" && CORRECTION_CODES.has(code)) {
    return { ...base, glyph: g("⌫"), class: "correction", scored: false, char: null };
  }
  if (b.behavior === "kp" && DELETE_CODES.has(code)) {
    return { ...base, glyph: g("⌦"), class: "correction", scored: false, char: null };
  }
  if (b.behavior === "kp" && ENTER_CODES.has(code)) {
    return { ...base, glyph: g("⏎"), class: "enter", scored: false, char: null };
  }
  if (b.behavior === "trans") {
    return { ...base, glyph: g("▽"), class: "other", scored: false, char: null };
  }
  if (b.behavior === "none") {
    return { ...base, glyph: g(""), class: "other", scored: false, char: null };
  }
  // Unknown / custom behavior (e.g. a tap-dance "lower" or hold-tap "magic"):
  // render the raw token, leave it unscored.
  return { ...base, glyph: g(`&${b.behavior}`), class: "other", scored: false, char: null };
}

// Curated thumb seeds (MIT, Pocket-authored — see CREDITS / data/PROVENANCE).
// Short, high-frequency tokens chosen for SPACE-cadence density (the space thumb
// is the dominant scorable thumb outcome). NOT pulled from the prose corpus.
const THUMB_SEEDS: string[] = [
  "a an and", "to be or", "if it is", "we go up", "in on at",
  "i am ok", "no go so", "us it me", "do re mi", "by my way",
  "the end is", "for you and me", "is it on or off", "up and to the side",
  "a a a a a", "to to to to", "and and and", "the the the",
  "i o i o i o", "as if at an",
];

function synthThumb(typedChars: string[], hasSpace: boolean, count: number): string[] {
  const filler = ["a", "e", "i", "o", "s", "t", "n"];
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const tokens: string[] = [];
    for (let t = 0; t < 6; t++) {
      if (hasSpace) tokens.push(filler[Math.floor(Math.random() * filler.length)]);
      else tokens.push(typedChars[Math.floor(Math.random() * typedChars.length)]);
    }
    lines.push(hasSpace ? tokens.join(" ") : tokens.join(""));
  }
  return lines;
}

/**
 * Generate a thumb-cluster drill from the given layer (defaults to the base /
 * first layer — the thumb cluster is where the everyday thumb keys live). The
 * scored text drills the space-cadence (and any typeable thumb symbols); every
 * non-scored thumb key is returned, labeled, under `guided` for the UI.
 */
export function generateThumbDrill(
  keymap: Keymap,
  layerName?: string,
  opts: ThumbDrillOptions = {},
): ThumbDrill {
  const lineCount = opts.lineCount ?? GENERATED_LINE_COUNT;
  const flagged = (reason: string, keys: ThumbKeyInfo[] = []): ThumbDrill => ({
    focus: "thumb",
    drillable: false,
    reason,
    typedChars: [],
    keys,
    guided: keys.filter((k) => !k.scored),
    mode: "random",
    targetedBigrams: [],
    lines: [],
    text: "",
  });

  const layer =
    (layerName ? keymap.layers.find((l) => l.name === layerName) : undefined) ?? keymap.layers[0];
  if (!layer) return flagged("no layers in keymap");

  const keys: ThumbKeyInfo[] = [];
  for (const idx of THUMB_INDICES) {
    const b = layer.bindings[idx];
    if (!b) continue; // degrade gracefully when a layer has < 75 bindings
    keys.push(classify(idx, b));
  }
  if (keys.length === 0) return flagged("keymap has no thumb-cluster bindings");

  const guided = keys.filter((k) => !k.scored);
  const typedChars = Array.from(new Set(keys.filter((k) => k.char !== null).map((k) => k.char!)));
  if (typedChars.length === 0) {
    return flagged("no typeable thumb keys to score (all modifiers/layers)", keys);
  }

  const hasSpace = typedChars.includes(" ");
  const symbols = typedChars.filter((c) => c !== " ");
  const candidates: string[] = [];
  if (hasSpace) candidates.push(...THUMB_SEEDS);
  for (const s of symbols) {
    candidates.push(`${s} ${s} ${s} ${s}`);
    if (hasSpace) candidates.push(`a ${s} a ${s} a ${s}`);
  }

  // Weak bigrams relevant to the thumb are those touching a scorable thumb char
  // (the space-cadence bigrams above all touch space).
  const weak = (opts.weakBigrams ?? []).filter((bg) =>
    Array.from(bg).some((c) => typedChars.includes(c)),
  );

  let sel = selectLines(candidates, weak, lineCount);
  if (sel.lines.length === 0) {
    sel = { mode: "random", targetedBigrams: [], lines: synthThumb(typedChars, hasSpace, lineCount) };
  }

  return {
    focus: "thumb",
    drillable: true,
    reason: null,
    typedChars,
    keys,
    guided,
    mode: sel.mode,
    targetedBigrams: sel.targetedBigrams,
    lines: sel.lines,
    text: sel.lines.join(" "),
  };
}
