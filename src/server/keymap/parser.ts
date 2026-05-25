// A FOCUSED devicetree-subset parser for ZMK keymaps — NOT a full devicetree
// implementation. ZMK keymaps are C-preprocessor-flavoured nested blocks; we only
// need the `keymap { ... }` node and its `layer_<Name> { bindings = < ... >; }`
// children. Everything else (#define/#include, behaviors{}, macros{}, combos) is
// noise we deliberately skip.
//
// The one structural fact that makes this tractable: inside a `bindings` block
// every key binding starts with '&' and its arguments never contain '&', so
// splitting the block on '&' yields exactly one "behavior arg*" chunk per key.

import { readFileSync } from "node:fs";
import { keycodeToChar, keycodeToGlyph } from "./keycodes";
import type { Binding, Keymap, Layer } from "./types";

/** Behaviors the engine interprets; anything else is rendered as its raw token. */
const INTERPRETED = new Set(["kp", "mo", "to", "tog", "lt", "mt", "trans", "none"]);

/** Strip block (/* … *\/) and line (// …) comments so they never confuse the scan. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * Given the index of an opening brace, return the substring between it and its
 * matching close brace plus the index of that close brace.
 */
function matchBraces(text: string, openIndex: number): { body: string; end: number } {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { body: text.slice(openIndex + 1, i), end: i };
    }
  }
  return { body: text.slice(openIndex + 1), end: text.length }; // unbalanced — degrade, don't crash
}

/** Find the `keymap { ... }` node body, or null if there isn't one. */
function findKeymapBody(src: string): string | null {
  // `keymap` followed by `{` is the node; the "zmk,keymap" string is followed by `"`.
  const m = /\bkeymap\s*\{/.exec(src);
  if (!m) return null;
  const braceIndex = m.index + m[0].length - 1;
  return matchBraces(src, braceIndex).body;
}

/** Strip a leading `LAYER_` from a layer-reference param so glyphs read cleanly. */
function layerLabel(param: string | undefined): string {
  if (!param) return "";
  return param.startsWith("LAYER_") ? param.slice(6) : param;
}

/** Resolve a binding's display glyph and typed character from its behavior + params. */
function renderBinding(
  behavior: string,
  params: string[],
  raw: string,
): { glyph: string; char: string | null } {
  switch (behavior) {
    case "kp":
      return { glyph: keycodeToGlyph(params[0] ?? ""), char: keycodeToChar(params[0] ?? "") };
    // mod-tap / layer-tap: the TAP keycode (2nd param) is what gets typed.
    case "mt":
    case "lt":
      return { glyph: keycodeToGlyph(params[1] ?? ""), char: keycodeToChar(params[1] ?? "") };
    case "mo":
      return { glyph: `L${layerLabel(params[0])}`, char: null };
    case "to":
      return { glyph: `→${layerLabel(params[0])}`, char: null };
    case "tog":
      return { glyph: `⇄${layerLabel(params[0])}`, char: null };
    case "trans":
      return { glyph: "▽", char: null };
    case "none":
      return { glyph: "", char: null };
    default:
      return { glyph: raw, char: null }; // unknown behavior → raw token passthrough
  }
}

/** Parse one `bindings = < ... >` block into an ordered list of bindings. */
function parseBindings(block: string): Binding[] {
  return block
    .split("&")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const tokens = chunk.split(/\s+/);
      const behavior = tokens[0];
      const params = tokens.slice(1);
      const raw = `&${tokens.join(" ")}`; // normalised: collapses source whitespace
      const { glyph, char } = renderBinding(behavior, params, raw);
      return { raw, behavior, params, known: INTERPRETED.has(behavior), glyph, char };
    });
}

/**
 * Parse a ZMK keymap source string. Returns layers in source order; a keymap with
 * no `keymap {}` node (or none found) yields an empty `layers` array rather than
 * throwing — "no usable keymap" is a first-class, non-crashing outcome.
 */
export function parseKeymap(source: string, sourcePath: string | null = null): Keymap {
  const src = stripComments(source);
  const keymapBody = findKeymapBody(src);
  const layers: Layer[] = [];

  if (keymapBody) {
    // Walk every child node of the keymap node; a child with a `bindings =` block is a layer.
    const nodeRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = nodeRe.exec(keymapBody)) !== null) {
      const braceIndex = m.index + m[0].length - 1;
      const { body, end } = matchBraces(keymapBody, braceIndex);
      const bindingsMatch = /bindings\s*=\s*<([^>]*)>/.exec(body);
      if (bindingsMatch) {
        const label = m[1];
        const name = label.startsWith("layer_") ? label.slice(6) : label;
        layers.push({ name, bindings: parseBindings(bindingsMatch[1]) });
      }
      nodeRe.lastIndex = end + 1; // skip past this child so we don't re-scan its body
    }
  }

  return { layers, sourcePath, parsedAt: Date.now() };
}

/** Read and parse a keymap file from disk. */
export function parseKeymapFile(path: string): Keymap {
  return parseKeymap(readFileSync(path, "utf8"), path);
}
