// The SINGLE keycode → character / glyph table for the whole keymap subsystem.
//
// Four consumers read off this module: the live SVG glyphs (step 5), the Mac
// modifier glyphs, the layer-drill typeable-character extraction (step 3) and the
// thumb-drill labels (step 3). Keeping one table here means the rendered keycap
// and the drillable character can never disagree.
//
// `keycodeToChar` returns the character a key PRODUCES WHEN TYPED (lowercase for
// letters, the resolved symbol for shift-wrappers, whitespace for SPACE/TAB/RET)
// or null when the key types nothing (modifiers, layer keys, arrows, F-keys,
// media, backspace/delete). `keycodeToGlyph` returns a short DISPLAY label.

/** Mac modifier glyphs. These keys type nothing (char === null) but render a glyph. */
const MAC_MOD: Record<string, string> = {
  LGUI: "⌘", RGUI: "⌘", LCMD: "⌘", RCMD: "⌘", LMETA: "⌘", RMETA: "⌘",
  LALT: "⌥", RALT: "⌥", LOPT: "⌥", ROPT: "⌥",
  LCTRL: "⌃", RCTRL: "⌃", LCTL: "⌃", RCTL: "⌃",
  LSHIFT: "⇧", RSHIFT: "⇧", LSHFT: "⇧", RSHFT: "⇧",
};

/** Shifted forms of the US-ANSI symbol/number row, used to resolve LS(...)/RS(...). */
const SHIFTED: Record<string, string> = {
  N1: "!", N2: "@", N3: "#", N4: "$", N5: "%", N6: "^", N7: "&", N8: "*", N9: "(", N0: ")",
  NUMBER_1: "!", NUMBER_2: "@", NUMBER_3: "#", NUMBER_4: "$", NUMBER_5: "%",
  NUMBER_6: "^", NUMBER_7: "&", NUMBER_8: "*", NUMBER_9: "(", NUMBER_0: ")",
  MINUS: "_", EQUAL: "+", LBKT: "{", RBKT: "}", BSLH: "|",
  SEMI: ":", SQT: '"', GRAVE: "~", COMMA: "<", DOT: ">", FSLH: "?",
};

/** Unshifted printable characters + whitespace keys. Backspace/Delete map to null (not here). */
const CHAR_MAP: Record<string, string> = {
  // number row
  N1: "1", N2: "2", N3: "3", N4: "4", N5: "5", N6: "6", N7: "7", N8: "8", N9: "9", N0: "0",
  NUMBER_1: "1", NUMBER_2: "2", NUMBER_3: "3", NUMBER_4: "4", NUMBER_5: "5",
  NUMBER_6: "6", NUMBER_7: "7", NUMBER_8: "8", NUMBER_9: "9", NUMBER_0: "0",
  // keypad
  KP_N0: "0", KP_N1: "1", KP_N2: "2", KP_N3: "3", KP_N4: "4",
  KP_N5: "5", KP_N6: "6", KP_N7: "7", KP_N8: "8", KP_N9: "9",
  KP_PLUS: "+", KP_MINUS: "-", KP_MULTIPLY: "*", KP_ASTERISK: "*",
  KP_SLASH: "/", KP_DIVIDE: "/", KP_EQUAL: "=", KP_DOT: ".", KP_ENTER: "\n",
  // punctuation (canonical ZMK names + a few long aliases)
  SEMI: ";", SEMICOLON: ";", SQT: "'", APOS: "'", APOSTROPHE: "'", SINGLE_QUOTE: "'",
  GRAVE: "`", BSLH: "\\", BACKSLASH: "\\", FSLH: "/", SLASH: "/",
  LBKT: "[", LEFT_BRACKET: "[", RBKT: "]", RIGHT_BRACKET: "]",
  EQUAL: "=", MINUS: "-", COMMA: ",", DOT: ".", PERIOD: ".",
  // ZMK symbol shorthand (so custom keymaps that bind symbols directly still resolve)
  EXCL: "!", EXCLAMATION: "!", AT: "@", HASH: "#", POUND: "#", DLLR: "$", DOLLAR: "$",
  PRCNT: "%", PERCENT: "%", CARET: "^", AMPS: "&", AMPERSAND: "&",
  STAR: "*", ASTRK: "*", ASTERISK: "*", LPAR: "(", LEFT_PARENTHESIS: "(",
  RPAR: ")", RIGHT_PARENTHESIS: ")", UNDER: "_", UNDERSCORE: "_", PLUS: "+",
  LBRC: "{", LEFT_BRACE: "{", RBRC: "}", RIGHT_BRACE: "}", PIPE: "|",
  COLON: ":", DQT: '"', DOUBLE_QUOTES: '"', TILDE: "~",
  LT: "<", LESS_THAN: "<", GT: ">", GREATER_THAN: ">", QMARK: "?", QUESTION: "?",
  // whitespace
  SPACE: " ", TAB: "\t", RET: "\n", RETURN: "\n", ENTER: "\n",
};

/** Nicer display glyphs for non-printable keys (everything else falls back to its char or raw name). */
const NAMED_GLYPH: Record<string, string> = {
  TAB: "Tab", ESC: "Esc", ESCAPE: "Esc",
  RET: "⏎", RETURN: "⏎", ENTER: "⏎", KP_ENTER: "⏎",
  SPACE: "␣", BSPC: "⌫", BACKSPACE: "⌫", DEL: "Del", DELETE: "Del",
  CAPS: "Caps", CAPSLOCK: "Caps", INS: "Ins", INSERT: "Ins",
  HOME: "Home", END: "End", PG_UP: "PgUp", PG_DN: "PgDn", PAGE_UP: "PgUp", PAGE_DOWN: "PgDn",
  UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→",
  UP_ARROW: "↑", DOWN_ARROW: "↓", LEFT_ARROW: "←", RIGHT_ARROW: "→",
  PRINTSCREEN: "PrtSc", SCROLLLOCK: "ScrLk", PAUSE_BREAK: "Pause", K_APP: "Menu",
  C_MUTE: "Mute", C_VOL_UP: "Vol+", C_VOL_DN: "Vol-",
  C_PREV: "⏮", C_NEXT: "⏭", C_PP: "⏯", C_BRI_UP: "Bri+", C_BRI_DN: "Bri-",
  KP_NUM: "Num",
};

interface ModWrapper {
  /** True for LS(...)/RS(...) — the only wrapper that yields a typeable character. */
  isShift: boolean;
  /** The mod glyph this wrapper prepends in display (⇧/⌃/⌥/⌘). */
  glyphPrefix: string;
  /** The wrapped inner keycode. */
  inner: string;
}

const MOD_WRAP = /^([LR])([SCAG])\((.+)\)$/;
const MOD_GLYPH: Record<string, string> = { S: "⇧", C: "⌃", A: "⌥", G: "⌘" };

/** Decompose a modifier-function wrapper like `LS(N9)` or `LC(A)`, or null if not one. */
function matchModWrapper(keycode: string): ModWrapper | null {
  const m = MOD_WRAP.exec(keycode);
  if (!m) return null;
  const letter = m[2];
  return { isShift: letter === "S", glyphPrefix: MOD_GLYPH[letter], inner: m[3] };
}

/** The character a SHIFTED keycode produces (e.g. N9 → "(", A → "A"), or null. */
function shiftedChar(inner: string): string | null {
  if (!inner) return null;
  if (SHIFTED[inner] !== undefined) return SHIFTED[inner];
  if (/^[A-Z]$/.test(inner)) return inner; // LS(A) → "A"
  return null;
}

/** The Mac modifier glyph for a keycode (⌘/⌥/⌃/⇧), or null when it is not a modifier. */
export function macModGlyph(keycode: string): string | null {
  return MAC_MOD[keycode] ?? null;
}

/**
 * The character a key produces WHEN TYPED, or null when it types nothing.
 * Letters resolve to lowercase; LS()/RS() shift-wrappers resolve to the shifted
 * symbol; SPACE/TAB/RET resolve to the whitespace they emit.
 */
export function keycodeToChar(keycode: string): string | null {
  if (!keycode) return null;
  const wrap = matchModWrapper(keycode);
  if (wrap) return wrap.isShift ? shiftedChar(wrap.inner) : null;
  if (/^[A-Z]$/.test(keycode)) return keycode.toLowerCase();
  return CHAR_MAP[keycode] ?? null;
}

/** A short display label for a keycode: char, named glyph, or the raw token as a last resort. */
export function keycodeToGlyph(keycode: string): string {
  if (!keycode) return "";
  const wrap = matchModWrapper(keycode);
  if (wrap) {
    if (wrap.isShift) {
      const sc = shiftedChar(wrap.inner);
      if (sc) return sc;
    }
    return wrap.glyphPrefix + keycodeToGlyph(wrap.inner);
  }
  const mod = MAC_MOD[keycode];
  if (mod) return mod;
  const named = NAMED_GLYPH[keycode];
  if (named) return named;
  if (/^[A-Z]$/.test(keycode)) return keycode; // letters render uppercase on the keycap
  const ch = keycodeToChar(keycode);
  if (ch && ch !== " " && ch !== "\t" && ch !== "\n") return ch;
  return keycode; // unknown keycode → faithful raw name (e.g. F1, RGB_TOG)
}
