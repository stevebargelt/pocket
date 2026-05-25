// ZMK keymap engine — data shapes shared by the parser, fingerprint, holder and
// every downstream consumer (drills, the live SVG, the layouts table).
//
// These types are engine-owned (NOT in src/shared/types.ts) so the keymap
// subsystem stays self-contained; the client imports them type-only off the
// JSON the routes return.

/** The number of physical keys on a Glove 80 — every layer should yield this many bindings. */
export const KEY_COUNT = 80;

/**
 * Thumb-cluster key indices into a layer's flat `bindings` array (6 per hand),
 * straight off the factory keymap's `POS_*` defines:
 *   LH_T1..T3 = 52..54, RH_T3..T1 = 55..57   (lower thumb row)
 *   LH_T4..T6 = 69..71, RH_T6..T4 = 72..74   (upper thumb row)
 * Source of truth for the thumb-cluster drills (step 3) and the SVG (step 5).
 */
export const THUMB_INDICES = [52, 53, 54, 55, 56, 57, 69, 70, 71, 72, 73, 74] as const;

/** A single key binding parsed from a ZMK layer's `bindings` block. */
export interface Binding {
  /** The normalised devicetree token, e.g. "&kp Q" or "&magic LAYER_Magic 0". */
  raw: string;
  /** The behavior name without the ampersand, e.g. "kp", "mo", "magic". */
  behavior: string;
  /** Positional args after the behavior, e.g. ["Q"] or ["LAYER_Magic", "0"]. */
  params: string[];
  /** True when the parser interpreted this behavior; false ⇒ `raw` is a passthrough. */
  known: boolean;
  /** Display glyph for the keymap SVG (e.g. "Q", "(", "⌘", "F1", "↑"); "" for &none. */
  glyph: string;
  /**
   * The character produced when this key is typed, or null when it produces none
   * (modifiers, layer keys, arrows, F-keys, media …). This is the single source the
   * layer/thumb drills key off to decide what is drillable.
   */
  char: string | null;
}

/** One ZMK layer: a name plus its ordered key bindings. */
export interface Layer {
  /** Layer name as declared by the `layer_<Name>` node, e.g. "Base". */
  name: string;
  /** Ordered bindings, one per physical key (KEY_COUNT for a Glove 80). */
  bindings: Binding[];
}

/** A fully parsed ZMK keymap. */
export interface Keymap {
  /** Layers in source order; index matches the ZMK layer number. */
  layers: Layer[];
  /** Absolute path the keymap was parsed from, or null when parsed from a string. */
  sourcePath: string | null;
  /** Epoch ms when this keymap was parsed. */
  parsedAt: number;
}
