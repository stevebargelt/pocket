import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCharToKeyIndex } from "../src/client/components/HeatMap";
import type { Keymap, Binding } from "../src/server/keymap/types";
import { KEY_LAYOUT } from "../src/client/components/glove80Layout";

// Build a minimal Binding from a behavior + optional char.
function b(behavior: string, char: string | null, glyph = ""): Binding {
  return { raw: behavior, behavior, params: [], known: true, glyph: glyph || char || "", char };
}

// Build a Keymap with a single base layer from a flat bindings array (pad to 80
// with &none if shorter).
function makeKeymap(bindings: Binding[]): Keymap {
  const padded = bindings.slice();
  while (padded.length < 80) padded.push(b("none", null, ""));
  return {
    layers: [{ name: "Base", bindings: padded }],
    sourcePath: null,
    parsedAt: 0,
  };
}

// Construct a minimal 80-key base layer that mirrors the factory Glove 80 layout
// (parser-binding order). Positions are indexed per glove80Layout.ts.
//
// Index reference (from glove80Layout.ts POSITIONS array comments):
//   0-9   row 1: LH C6..C2 | RH C2..C6 (10 keys)
//   10-21 row 2: LH C6..C1 | RH C1..C6 (12 keys)
//   22-33 row 3: same pattern            (12 keys)
//   34-45 row 4                          (12 keys)
//   46-51 row 5 LH C6..C1               (6 keys)
//   52-54 upper thumb LH T1..T3
//   55-57 upper thumb RH T3..T1
//   58-63 row 5 RH C1..C6               (6 keys)
//   64-68 row 6 LH C6..C2               (5 keys)
//   69-71 lower thumb LH T4..T6
//   72-74 lower thumb RH T6..T4
//   75-79 row 6 RH C2..C6               (5 keys)

test("buildCharToKeyIndex: returns empty map for keymap with no char bindings", () => {
  const km = makeKeymap([]);
  const m = buildCharToKeyIndex(km);
  assert.equal(m.size, 0);
});

test("buildCharToKeyIndex: returns empty map when layers array is empty", () => {
  const km: Keymap = { layers: [], sourcePath: null, parsedAt: 0 };
  const m = buildCharToKeyIndex(km);
  assert.equal(m.size, 0);
});

test("buildCharToKeyIndex: maps a single char to its key index", () => {
  // Place 'a' at index 2 (row 1, LH C4).
  const bindings: Binding[] = Array.from({ length: 80 }, () => b("none", null));
  bindings[2] = b("kp", "a", "a");
  const m = buildCharToKeyIndex(makeKeymap(bindings));
  assert.equal(m.get("a"), 2);
});

test("buildCharToKeyIndex: maps multiple chars to correct indices", () => {
  const bindings: Binding[] = Array.from({ length: 80 }, () => b("none", null));
  bindings[10] = b("kp", "q", "q"); // first key of row 2
  bindings[11] = b("kp", "w", "w");
  bindings[12] = b("kp", "e", "e");
  const m = buildCharToKeyIndex(makeKeymap(bindings));
  assert.equal(m.get("q"), 10);
  assert.equal(m.get("w"), 11);
  assert.equal(m.get("e"), 12);
});

test("buildCharToKeyIndex: ignores null-char (non-typeable) keys", () => {
  const bindings: Binding[] = Array.from({ length: 80 }, () => b("none", null));
  bindings[0] = b("mo", null, "LLower"); // layer key — no char
  bindings[1] = b("kp", "x", "x");
  const m = buildCharToKeyIndex(makeKeymap(bindings));
  assert.equal(m.has("LLower"), false);
  assert.equal(m.get("x"), 1);
});

test("buildCharToKeyIndex: first occurrence wins for duplicate chars", () => {
  const bindings: Binding[] = Array.from({ length: 80 }, () => b("none", null));
  bindings[5] = b("kp", "a", "a");
  bindings[15] = b("kp", "a", "a"); // duplicate — should be ignored
  const m = buildCharToKeyIndex(makeKeymap(bindings));
  assert.equal(m.get("a"), 5);
});

test("buildCharToKeyIndex: space key is mapped", () => {
  const bindings: Binding[] = Array.from({ length: 80 }, () => b("none", null));
  // Typical: space lives in the thumb cluster at index 74 (RH T4 lower row).
  bindings[74] = b("kp", " ", " ");
  const m = buildCharToKeyIndex(makeKeymap(bindings));
  assert.equal(m.get(" "), 74);
});

test("character with stats projects to the correct physical key", () => {
  // Build a keymap where 'h' is at index 29 (row 3, RH C2).
  const bindings: Binding[] = Array.from({ length: 80 }, () => b("none", null));
  bindings[29] = b("kp", "h", "h");
  const km = makeKeymap(bindings);

  const charToKeyIndex = buildCharToKeyIndex(km);
  const keyIndex = charToKeyIndex.get("h");

  assert.equal(keyIndex, 29, "'h' should project to key index 29");

  // Confirm that KEY_LAYOUT[29] is a real, non-thumb right-hand key.
  const geom = KEY_LAYOUT[29];
  assert.ok(geom, "KEY_LAYOUT[29] must exist");
  assert.equal(geom.hand, "R", "index 29 is a right-hand key");
  assert.equal(geom.thumb, false, "index 29 is not a thumb key");
});
