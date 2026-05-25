import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateLayerDrill,
  keycodeToChar,
  type Binding,
  type Keymap,
} from "../src/server/drills/layerDrills";
import { generateThumbDrill, THUMB_INDICES } from "../src/server/drills/thumbDrills";

// Build a Binding[] from a raw ZMK `bindings` block by segmenting on '&', exactly
// as the step-2 parser does. Lets us paste the real factory rows verbatim so the
// drills run against a genuine parsed keymap.
function bindings(spec: string): Binding[] {
  return spec
    .split("&")
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map((chunk) => {
      const [behavior, ...params] = chunk.split(/\s+/);
      return { behavior, params };
    });
}

// Factory-default Glove 80 (macOS) layers, verbatim from the committed keymap.
const BASE = bindings(`
  &kp F1 &kp F2 &kp F3 &kp F4 &kp F5 &kp F6 &kp F7 &kp F8 &kp F9 &kp F10
  &kp EQUAL &kp N1 &kp N2 &kp N3 &kp N4 &kp N5 &kp N6 &kp N7 &kp N8 &kp N9 &kp N0 &kp MINUS
  &kp TAB &kp Q &kp W &kp E &kp R &kp T &kp Y &kp U &kp I &kp O &kp P &kp BSLH
  &kp ESC &kp A &kp S &kp D &kp F &kp G &kp H &kp J &kp K &kp L &kp SEMI &kp SQT
  &kp GRAVE &kp Z &kp X &kp C &kp V &kp B &kp LSHFT &kp LGUI &lower &kp LCTRL &kp RGUI &kp RSHFT &kp N &kp M &kp COMMA &kp DOT &kp FSLH &kp PG_UP
  &magic LAYER_Magic 0 &kp HOME &kp END &kp LEFT &kp RIGHT &kp BSPC &kp DEL &kp LALT &kp RALT &kp RET &kp SPACE &kp UP &kp DOWN &kp LBKT &kp RBKT &kp PG_DN
`);

const LOWER = bindings(`
  &kp C_BRI_DN &kp C_BRI_UP &kp C_PREV &kp C_NEXT &kp C_PP &kp C_MUTE &kp C_VOL_DN &kp C_VOL_UP &none &kp PAUSE_BREAK
  &trans &none &none &none &none &kp HOME &kp LS(N9) &kp KP_NUM &kp KP_EQUAL &kp KP_SLASH &kp KP_MULTIPLY &kp PRINTSCREEN
  &trans &none &none &kp UP_ARROW &none &kp END &kp LS(N0) &kp KP_N7 &kp KP_N8 &kp KP_N9 &kp KP_MINUS &kp SCROLLLOCK
  &trans &none &kp LEFT_ARROW &kp DOWN_ARROW &kp RIGHT_ARROW &kp PG_UP &kp LS(N5) &kp KP_N4 &kp KP_N5 &kp KP_N6 &kp KP_PLUS &none
  &trans &kp K_APP &none &kp F11 &kp F12 &kp PG_DN &trans &trans &to 0 &trans &trans &trans &kp COMMA &kp KP_N1 &kp KP_N2 &kp KP_N3 &kp KP_ENTER &trans
  &magic LAYER_Magic 0 &kp CAPS &kp INS &kp F11 &kp F12 &trans &trans &trans &trans &trans &trans &kp KP_N0 &kp KP_N0 &kp KP_DOT &kp KP_ENTER &trans
`);

const MAGIC = bindings(`
  &bt BT_CLR &none &none &none &none &none &none &none &none &bt BT_CLR_ALL
  &none &none &none &none &none &none &none &none &none &none &none &none
  &none &rgb_ug RGB_SPI &rgb_ug RGB_SAI &rgb_ug RGB_HUI &rgb_ug RGB_BRI &rgb_ug RGB_TOG &none &none &none &none &none &none
  &bootloader &rgb_ug RGB_SPD &rgb_ug RGB_SAD &rgb_ug RGB_HUD &rgb_ug RGB_BRD &rgb_ug RGB_EFF &none &none &none &none &none &bootloader
  &sys_reset &none &none &none &none &none &bt_2 &bt_3 &none &none &none &none &none &none &none &none &none &sys_reset
  &none &none &none &none &none &bt_0 &bt_1 &out OUT_USB &none &none &none &none &none &none &none &to LAYER_Factory
`);

const FACTORY = bindings(`
  &kp NUMBER_0 &kp NUMBER_6 &kp NUMBER_2 &kp NUMBER_8 &kp NUMBER_4 &kp NUMBER_4 &kp NUMBER_8 &kp NUMBER_2 &kp NUMBER_6 &kp NUMBER_0
  &kp NUMBER_1 &kp NUMBER_7 &kp NUMBER_3 &kp NUMBER_9 &kp NUMBER_5 &kp NUMBER_0 &kp NUMBER_0 &kp NUMBER_5 &kp NUMBER_9 &kp NUMBER_3 &kp NUMBER_7 &kp NUMBER_1
  &kp NUMBER_2 &kp NUMBER_8 &kp NUMBER_4 &kp NUMBER_0 &kp NUMBER_6 &kp NUMBER_1 &kp NUMBER_1 &kp NUMBER_6 &kp NUMBER_0 &kp NUMBER_4 &kp NUMBER_8 &kp NUMBER_2
  &kp NUMBER_3 &kp NUMBER_9 &kp NUMBER_5 &kp NUMBER_1 &kp NUMBER_7 &kp NUMBER_2 &kp NUMBER_2 &kp NUMBER_7 &kp NUMBER_1 &kp NUMBER_5 &kp NUMBER_9 &kp NUMBER_3
  &kp NUMBER_4 &kp NUMBER_0 &kp NUMBER_6 &kp NUMBER_2 &kp NUMBER_8 &kp NUMBER_3 &kp NUMBER_4 &kp NUMBER_5 &kp NUMBER_6 &kp NUMBER_6 &kp NUMBER_5 &kp NUMBER_4 &kp NUMBER_3 &kp NUMBER_8 &kp NUMBER_2 &kp NUMBER_6 &kp NUMBER_0 &kp NUMBER_4
  &kp NUMBER_5 &kp NUMBER_1 &kp NUMBER_7 &kp NUMBER_3 &kp NUMBER_9 &kp NUMBER_7 &kp NUMBER_8 &kp NUMBER_9 &kp NUMBER_9 &kp NUMBER_8 &kp NUMBER_7 &kp NUMBER_9 &kp NUMBER_3 &kp NUMBER_7 &kp NUMBER_1 &kp NUMBER_5
`);

const FACTORY_KEYMAP: Keymap = {
  layers: [
    { name: "Base", bindings: BASE },
    { name: "Lower", bindings: LOWER },
    { name: "Magic", bindings: MAGIC },
    { name: "Factory", bindings: FACTORY },
  ],
};

// ── Fixture sanity: the pasted rows are genuine 80-key Glove 80 layers ──

test("each factory layer parses to exactly 80 bindings", () => {
  for (const layer of FACTORY_KEYMAP.layers) {
    assert.equal(layer.bindings.length, 80, `${layer.name} should have 80 bindings`);
  }
});

// ── Keycode resolution feeds drill character extraction ──

test("keycodeToChar resolves letters, numbers, punctuation, keypad and shift-wrappers", () => {
  assert.equal(keycodeToChar("Q"), "q");
  assert.equal(keycodeToChar("N5"), "5");
  assert.equal(keycodeToChar("NUMBER_7"), "7");
  assert.equal(keycodeToChar("KP_N7"), "7");
  assert.equal(keycodeToChar("SEMI"), ";");
  assert.equal(keycodeToChar("FSLH"), "/");
  assert.equal(keycodeToChar("KP_PLUS"), "+");
  assert.equal(keycodeToChar("LS(N9)"), "(");
  assert.equal(keycodeToChar("LS(N0)"), ")");
  assert.equal(keycodeToChar("LS(N5)"), "%");
  // Non-typeable codes resolve to null (not scorable through the typing surface).
  assert.equal(keycodeToChar("LSHFT"), null);
  assert.equal(keycodeToChar("RET"), null);
  assert.equal(keycodeToChar("BSPC"), null);
  assert.equal(keycodeToChar("F5"), null);
});

// ── Layer drills ──

test("layer drill produces non-empty on-layer text for a drillable layer (Lower)", () => {
  const drill = generateLayerDrill(FACTORY_KEYMAP, "Lower");
  assert.equal(drill.drillable, true);
  assert.equal(drill.reason, null);
  assert.ok(drill.text.length > 0, "Lower drill text should be non-empty");
  assert.ok(drill.lines.length > 0);
  // Lower binds the keypad/symbol set: parens, percent, digits, math ops.
  for (const c of ["(", ")", "%"]) {
    assert.ok(drill.chars.includes(c), `Lower chars should include ${c}`);
  }
  // Every non-space character in the generated text is bound on the layer.
  const allowed = new Set([...drill.chars, " "]);
  for (const ch of drill.text) {
    assert.ok(allowed.has(ch), `generated char ${JSON.stringify(ch)} must be bound on Lower`);
  }
});

test("layer drill flags a non-drillable layer (Magic) instead of crashing or emitting empty silently", () => {
  const drill = generateLayerDrill(FACTORY_KEYMAP, "Magic");
  assert.equal(drill.drillable, false);
  assert.ok(drill.reason && drill.reason.length > 0, "must explain why Magic is not drillable");
  assert.equal(drill.text, "");
  assert.deepEqual(drill.lines, []);
  assert.deepEqual(drill.chars, []);
});

test("layer drill flags an unknown layer name", () => {
  const drill = generateLayerDrill(FACTORY_KEYMAP, "DoesNotExist");
  assert.equal(drill.drillable, false);
  assert.match(drill.reason ?? "", /not found/);
});

test("a number-only layer (Factory) is drillable and emits digit practice", () => {
  const drill = generateLayerDrill(FACTORY_KEYMAP, "Factory");
  assert.equal(drill.drillable, true);
  assert.ok(drill.text.length > 0);
  assert.deepEqual(drill.chars, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
});

test("layer drill targeting respects weak bigrams", () => {
  // Base binds every letter, so lowercase prose lines fit. Weak bigrams should
  // drive selection toward lines that contain them, exactly like generator.ts.
  const corpus = [
    "the path north",
    "a plan and a map",
    "rolling green hills",
    "quiet ocean waves",
    "the other brother",
  ];
  const weakBigrams = ["th", "an"];
  const drill = generateLayerDrill(FACTORY_KEYMAP, "Base", { corpus, weakBigrams });
  assert.equal(drill.mode, "targeted");
  assert.ok(drill.targetedBigrams.length > 0);
  for (const line of drill.lines) {
    assert.ok(
      drill.targetedBigrams.some((b) => line.includes(b)),
      `targeted line should contain a weak bigram: "${line}"`,
    );
  }
});

// ── Thumb drills ──

test("thumb drill labels all 12 thumb keys and scores only typeable outcomes", () => {
  const drill = generateThumbDrill(FACTORY_KEYMAP, "Base");
  assert.equal(drill.drillable, true);
  assert.equal(drill.keys.length, THUMB_INDICES.length);

  // On the factory base layer the only scorable thumb outcome is space.
  assert.deepEqual(drill.typedChars, [" "]);
  assert.ok(drill.text.includes(" "), "thumb drill text must exercise the space key");
  assert.ok(drill.text.length > 0);

  // Non-observable thumb keys are surfaced as labeled, guided/unscored items.
  assert.equal(drill.guided.length, 11);
  assert.ok(
    drill.guided.some((k) => k.class === "enter" && k.glyph === "⏎"),
    "Enter (RET) should be a labeled guided key",
  );
  assert.ok(
    drill.guided.some((k) => k.class === "correction" && k.glyph === "⌫"),
    "Backspace should be a labeled guided key",
  );
  assert.ok(
    drill.guided.some((k) => k.class === "modifier" && k.glyph === "⇧"),
    "Shift should be a labeled guided modifier",
  );
  assert.ok(
    drill.guided.some((k) => k.class === "modifier" && k.glyph === "⌘"),
    "Cmd (LGUI) should render the ⌘ glyph",
  );
  // No guided key is marked scored.
  assert.ok(drill.guided.every((k) => !k.scored));
});

test("thumb drill classifies layer-toggle thumb keys as guided layer items", () => {
  // A custom keymap with a momentary-layer key on a thumb position (index 52).
  const custom: Keymap = {
    layers: [
      {
        name: "Base",
        bindings: BASE.map((b, i) =>
          i === 52 ? { behavior: "mo", params: ["1"] } : b,
        ),
      },
    ],
  };
  const drill = generateThumbDrill(custom, "Base");
  const moKey = drill.keys.find((k) => k.index === 52);
  assert.ok(moKey);
  assert.equal(moKey!.class, "layer");
  assert.equal(moKey!.scored, false);
  assert.match(moKey!.glyph, /mo 1/);
});

test("thumb drill flags a cluster with no scorable outcomes", () => {
  // All thumb keys are modifiers/layers/none -> nothing to score, but still
  // return the labeled guided cluster for the UI.
  const allGuided: Keymap = {
    layers: [
      {
        name: "Base",
        bindings: BASE.map((b, i) =>
          THUMB_INDICES.includes(i as (typeof THUMB_INDICES)[number])
            ? { behavior: "kp", params: ["LSHFT"] }
            : b,
        ),
      },
    ],
  };
  const drill = generateThumbDrill(allGuided, "Base");
  assert.equal(drill.drillable, false);
  assert.ok(drill.reason && drill.reason.length > 0);
  assert.equal(drill.text, "");
  assert.equal(drill.keys.length, THUMB_INDICES.length);
  assert.equal(drill.guided.length, THUMB_INDICES.length);
});

test("thumb drill targeting favors space-cadence weak bigrams", () => {
  // Weak bigrams that touch space should drive selection.
  const drill = generateThumbDrill(FACTORY_KEYMAP, "Base", { weakBigrams: ["e ", " t", "xz"] });
  if (drill.targetedBigrams.length > 0) {
    for (const line of drill.lines) {
      assert.ok(
        drill.targetedBigrams.some((b) => line.includes(b)),
        `targeted thumb line should contain a weak bigram: "${line}"`,
      );
    }
    // "xz" never touches a thumb char, so it is filtered out before targeting.
    assert.ok(!drill.targetedBigrams.includes("xz"));
  }
});

test("thumb drill defaults to the first layer when no layer name is given", () => {
  const drill = generateThumbDrill(FACTORY_KEYMAP);
  assert.equal(drill.drillable, true);
  assert.ok(drill.text.length > 0);
});

test("both generators are pure: repeated calls do not mutate the keymap", () => {
  const before = JSON.stringify(FACTORY_KEYMAP);
  generateLayerDrill(FACTORY_KEYMAP, "Lower");
  generateThumbDrill(FACTORY_KEYMAP, "Base");
  assert.equal(JSON.stringify(FACTORY_KEYMAP), before);
});
