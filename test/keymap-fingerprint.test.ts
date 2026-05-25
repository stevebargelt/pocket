import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKeymap, parseKeymapFile } from "../src/server/keymap/parser";
import { fingerprintKeymap } from "../src/server/keymap/fingerprint";

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTORY = resolve(HERE, "fixtures/keymaps/factory.keymap");
const CUSTOM = resolve(HERE, "fixtures/keymaps/custom.keymap");

test("fingerprint is byte-identical across repeated parses of the same file", () => {
  const a = fingerprintKeymap(parseKeymapFile(FACTORY));
  const b = fingerprintKeymap(parseKeymapFile(FACTORY));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/, "SHA-256 hex digest");
});

test("fingerprint differs for the custom variant (renamed layer + changed binding)", () => {
  const factory = fingerprintKeymap(parseKeymapFile(FACTORY));
  const custom = fingerprintKeymap(parseKeymapFile(CUSTOM));
  assert.notEqual(factory, custom);
});

test("fingerprint ignores comment + whitespace metadata edits", () => {
  const original = readFileSync(FACTORY, "utf8");
  const base = fingerprintKeymap(parseKeymap(original));

  // A re-export comment, an in-layer comment, and reflowed binding whitespace —
  // all metadata/formatting; the parsed bindings (and so the fingerprint) are unchanged.
  const edited = `/* re-exported 2026-05-25 */\n${original
    .replace("layer_Base {", "layer_Base {\n            /* base layer */")
    .replace("&kp Q", "&kp     Q")}`;
  const after = fingerprintKeymap(parseKeymap(edited));
  assert.equal(base, after, "metadata-only change must not move the fingerprint");
});

test("empty / non-keymap source yields a stable hash distinct from real layouts", () => {
  const empty = fingerprintKeymap(parseKeymap("// nothing here"));
  const empty2 = fingerprintKeymap(parseKeymap(""));
  assert.equal(empty, empty2);
  assert.notEqual(empty, fingerprintKeymap(parseKeymapFile(FACTORY)));
});
