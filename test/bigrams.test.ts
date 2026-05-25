import { test } from "node:test";
import assert from "node:assert/strict";
import { extractKeys, extractBigrams, containsBigram, bigramOf } from "../src/shared/bigrams";

test("extractKeys returns every literal character including space", () => {
  assert.deepEqual(extractKeys("a b"), ["a", " ", "b"]);
  assert.deepEqual(extractKeys(""), []);
});

test("capitals are distinct from lowercase", () => {
  assert.deepEqual(extractKeys("Tt"), ["T", "t"]);
  assert.notDeepEqual(extractBigrams("Tt"), extractBigrams("tt"));
});

test("bigram count == length - 1", () => {
  assert.equal(extractBigrams("hello").length, "hello".length - 1);
  assert.deepEqual(extractBigrams("the"), ["th", "he"]);
  assert.deepEqual(extractBigrams("a"), []);
  assert.deepEqual(extractBigrams(""), []);
});

test("space-containing bigrams are real units", () => {
  assert.deepEqual(extractBigrams("a b"), ["a ", " b"]);
  assert.equal(bigramOf("a", " "), "a ");
});

test("containsBigram agrees with extractBigrams membership", () => {
  const samples = ["the quick brown fox", "hello world", "a", "", "  spaces  "];
  for (const text of samples) {
    const members = new Set(extractBigrams(text));
    // Every extracted bigram is found by containsBigram.
    for (const b of members) {
      assert.ok(containsBigram(text, b), `expected containsBigram("${text}", "${b}")`);
    }
    // And containsBigram only returns true for actual members.
    for (const b of ["zz", "xq", "qz"]) {
      assert.equal(containsBigram(text, b), members.has(b));
    }
  }
});
