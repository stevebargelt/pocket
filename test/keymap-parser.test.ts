import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKeymap, parseKeymapFile } from "../src/server/keymap/parser";
import { keycodeToChar, keycodeToGlyph, macModGlyph } from "../src/server/keymap/keycodes";
import { KEY_COUNT } from "../src/server/keymap/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTORY = resolve(HERE, "fixtures/keymaps/factory.keymap");
const CUSTOM = resolve(HERE, "fixtures/keymaps/custom.keymap");

test("parser extracts exactly 4 layers of 80 bindings from the factory keymap", () => {
  const km = parseKeymapFile(FACTORY);
  assert.equal(km.layers.length, 4);
  assert.deepEqual(
    km.layers.map((l) => l.name),
    ["Base", "Lower", "Magic", "Factory"],
  );
  for (const layer of km.layers) {
    assert.equal(layer.bindings.length, KEY_COUNT, `${layer.name} should have ${KEY_COUNT} bindings`);
  }
});

test("&kp resolves letters, mac modifiers and shifted symbols", () => {
  const km = parseKeymapFile(FACTORY);
  const base = km.layers[0];
  const lower = km.layers[1];

  const q = base.bindings.find((b) => b.raw === "&kp Q")!;
  assert.equal(q.known, true);
  assert.equal(q.char, "q");
  assert.equal(q.glyph, "Q");

  const lgui = base.bindings.find((b) => b.raw === "&kp LGUI")!;
  assert.equal(lgui.char, null, "modifiers type nothing");
  assert.equal(lgui.glyph, "⌘");

  const ls9 = lower.bindings.find((b) => b.raw === "&kp LS(N9)")!;
  assert.equal(ls9.char, "(");
  assert.equal(ls9.glyph, "(");
});

test("&trans / &to interpreted; unknown behaviors survive as raw tokens", () => {
  const km = parseKeymapFile(FACTORY);
  const lower = km.layers[1];

  const trans = lower.bindings.find((b) => b.behavior === "trans")!;
  assert.equal(trans.known, true);
  assert.equal(trans.char, null);

  const to = lower.bindings.find((b) => b.behavior === "to")!;
  assert.equal(to.known, true);
  assert.equal(to.params[0], "0");

  // &magic is a custom hold-tap — unknown to us; must passthrough as raw, not crash.
  const magic = km.layers[0].bindings.find((b) => b.behavior === "magic")!;
  assert.equal(magic.known, false);
  assert.equal(magic.char, null);
  assert.ok(magic.raw.startsWith("&magic"));
});

test("all core behaviors are interpreted on a hand-built layer", () => {
  const src = `
    / {
      keymap {
        compatible = "zmk,keymap";
        layer_Test {
          bindings = <
            &kp A &mo 1 &to 0 &tog 2 &lt 3 SPACE &mt LSHFT TAB &trans &none &foobar BAZ
          >;
        };
      };
    };`;
  const km = parseKeymap(src);
  assert.equal(km.layers.length, 1);
  const b = km.layers[0].bindings;
  assert.deepEqual(
    b.map((x) => x.behavior),
    ["kp", "mo", "to", "tog", "lt", "mt", "trans", "none", "foobar"],
  );
  assert.deepEqual(
    b.map((x) => x.known),
    [true, true, true, true, true, true, true, true, false],
  );

  // layer-tap / mod-tap expose the TAP keycode as the typeable char.
  assert.equal(b[4].char, " ", "&lt 3 SPACE → space");
  assert.equal(b[5].char, "\t", "&mt LSHFT TAB → tab");
  assert.equal(b[6].glyph, "▽", "&trans glyph");
  assert.equal(b[7].glyph, "", "&none renders blank");
  assert.equal(b[8].raw, "&foobar BAZ", "unknown behavior passthrough");
});

test("keycodes table resolves the documented cases", () => {
  // shifted symbols
  assert.equal(keycodeToChar("LS(N9)"), "(");
  assert.equal(keycodeToChar("LS(N0)"), ")");
  assert.equal(keycodeToChar("LS(N5)"), "%");
  // punctuation
  assert.equal(keycodeToChar("SEMI"), ";");
  assert.equal(keycodeToChar("SQT"), "'");
  assert.equal(keycodeToChar("GRAVE"), "`");
  assert.equal(keycodeToChar("BSLH"), "\\");
  assert.equal(keycodeToChar("FSLH"), "/");
  assert.equal(keycodeToChar("LBKT"), "[");
  assert.equal(keycodeToChar("RBKT"), "]");
  assert.equal(keycodeToChar("EQUAL"), "=");
  assert.equal(keycodeToChar("MINUS"), "-");
  // numbers + keypad
  assert.equal(keycodeToChar("N1"), "1");
  assert.equal(keycodeToChar("N0"), "0");
  assert.equal(keycodeToChar("KP_N7"), "7");
  // whitespace + non-typeable
  assert.equal(keycodeToChar("SPACE"), " ");
  assert.equal(keycodeToChar("LGUI"), null);

  // Mac modifier glyphs (LSHIFT/RSHIFT and the LSHFT/RSHFT spellings the editor emits)
  assert.equal(macModGlyph("LGUI"), "⌘");
  assert.equal(macModGlyph("LALT"), "⌥");
  assert.equal(macModGlyph("LCTRL"), "⌃");
  assert.equal(macModGlyph("LSHIFT"), "⇧");
  assert.equal(macModGlyph("RSHFT"), "⇧");
  assert.equal(macModGlyph("Q"), null);

  // glyph fallbacks
  assert.equal(keycodeToGlyph("F1"), "F1");
  assert.equal(keycodeToGlyph("UP"), "↑");
});

test("cold parse completes in well under 100ms", () => {
  const t0 = performance.now();
  parseKeymapFile(FACTORY);
  const ms = performance.now() - t0;
  assert.ok(ms < 100, `cold parse took ${ms.toFixed(1)}ms`);
});

test("custom fixture is a renamed-layer variant that still parses to 80 bindings/layer", () => {
  const km = parseKeymapFile(CUSTOM);
  assert.ok(km.layers.some((l) => l.name === "Symbols"), "Lower was renamed to Symbols");
  for (const layer of km.layers) assert.equal(layer.bindings.length, KEY_COUNT);
});
