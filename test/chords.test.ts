import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRILL_CHORDS,
  buildDrillPrompts,
  chordFromEvent,
  chordLabel,
  isDrillChord,
  summarizeAttempts,
  type ChordEventLike,
} from "../src/shared/chords";
import { SHORTCUT_DRILL_REPS } from "../src/shared/constants";

const NO_MODS = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
const ev = (key: string, mods: Partial<ChordEventLike> = {}): ChordEventLike => ({ key, ...NO_MODS, ...mods });

/** mulberry32: a small deterministic PRNG for seeded shuffles. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("chordFromEvent: every drilled chord", () => {
  const cases: Array<[ChordEventLike, string]> = [
    [ev("c", { metaKey: true }), "cmd+c"],
    [ev("v", { metaKey: true }), "cmd+v"],
    [ev("a", { metaKey: true }), "cmd+a"],
    [ev("x", { metaKey: true }), "cmd+x"],
    [ev("z", { metaKey: true }), "cmd+z"],
    [ev("s", { metaKey: true }), "cmd+s"],
    [ev("c", { ctrlKey: true }), "ctrl+c"],
    [ev("b", { ctrlKey: true }), "ctrl+b"],
    [ev("Backspace"), "backspace"],
    [ev("Delete"), "delete"],
  ];
  assert.deepEqual(
    cases.map(([, id]) => id),
    [...DRILL_CHORDS],
    "cases cover DRILL_CHORDS in order",
  );
  for (const [e, id] of cases) assert.equal(chordFromEvent(e), id, JSON.stringify(e));
});

test("chordFromEvent: lone modifier and lock keys return null, even with modifiers held", () => {
  const lone = ["Meta", "Control", "Alt", "Shift", "CapsLock", "Fn", "FnLock", "Hyper", "Super", "OS", "Dead", "Unidentified"];
  for (const key of lone) {
    assert.equal(chordFromEvent(ev(key)), null, key);
    assert.equal(chordFromEvent(ev(key, { metaKey: true, shiftKey: true })), null, `${key} with mods`);
  }
});

test("chordFromEvent: extra modifiers produce a different id (⇧⌘C ≠ ⌘C)", () => {
  const plain = chordFromEvent(ev("c", { metaKey: true }));
  const shifted = chordFromEvent(ev("C", { metaKey: true, shiftKey: true }));
  assert.equal(plain, "cmd+c");
  assert.equal(shifted, "shift+cmd+c");
  assert.notEqual(shifted, plain);
  assert.equal(chordFromEvent(ev("c", { metaKey: true, altKey: true })), "alt+cmd+c");
  assert.equal(chordFromEvent(ev("c", { ctrlKey: true, metaKey: true })), "ctrl+cmd+c");
});

test("chordFromEvent: modifiers in fixed order ctrl, alt, shift, cmd; keys lower-cased", () => {
  assert.equal(chordFromEvent(ev("Z", { shiftKey: true, metaKey: true })), "shift+cmd+z");
  assert.equal(
    chordFromEvent(ev("k", { metaKey: true, shiftKey: true, altKey: true, ctrlKey: true })),
    "ctrl+alt+shift+cmd+k",
  );
  assert.equal(chordFromEvent(ev("ArrowLeft")), "arrowleft");
  assert.equal(chordFromEvent(ev("Enter", { metaKey: true })), "cmd+enter");
  assert.equal(chordFromEvent(ev(" ")), "space");
  assert.equal(chordFromEvent(ev("x")), "x");
});

test("isDrillChord: only DRILL_CHORDS entries", () => {
  for (const c of DRILL_CHORDS) assert.ok(isDrillChord(c), c);
  for (const c of ["cmd+w", "cmd+t", "cmd+q", "cmd+r", "cmd+n", "shift+cmd+z", "x", "", "CMD+C"]) {
    assert.equal(isDrillChord(c), false, c);
  }
  assert.equal(isDrillChord(42), false);
  assert.equal(isDrillChord(undefined), false);
});

test("chordLabel: Mac glyphs in ⌃⌥⇧⌘ order for every drilled chord plus shift+cmd+z", () => {
  const expected: Record<string, string> = {
    "cmd+c": "⌘C",
    "cmd+v": "⌘V",
    "cmd+a": "⌘A",
    "cmd+x": "⌘X",
    "cmd+z": "⌘Z",
    "cmd+s": "⌘S",
    "ctrl+c": "⌃C",
    "ctrl+b": "⌃B",
    backspace: "⌫",
    delete: "⌦",
  };
  assert.deepEqual(Object.keys(expected), [...DRILL_CHORDS]);
  for (const c of DRILL_CHORDS) assert.equal(chordLabel(c), expected[c], c);
  assert.equal(chordLabel("shift+cmd+z"), "⇧⌘Z");
  assert.equal(chordLabel("ctrl+alt+shift+cmd+k"), "⌃⌥⇧⌘K");
  assert.equal(chordLabel("enter"), "Enter");
  assert.equal(chordLabel("cmd++"), "⌘+");
});

test("buildDrillPrompts: 30 prompts, each chord exactly 3 times, no adjacent repeats, over many seeds", () => {
  const banned = new Set(["cmd+w", "cmd+t", "cmd+q", "cmd+r", "cmd+n"]);
  const orders = new Set<string>();
  for (let seed = 1; seed <= 500; seed++) {
    const prompts = buildDrillPrompts(seeded(seed));
    assert.equal(prompts.length, DRILL_CHORDS.length * SHORTCUT_DRILL_REPS);
    assert.equal(prompts.length, 30);
    for (const c of DRILL_CHORDS) {
      assert.equal(prompts.filter((p) => p === c).length, 3, `seed ${seed}: ${c} count`);
    }
    for (let i = 1; i < prompts.length; i++) {
      assert.notEqual(prompts[i], prompts[i - 1], `seed ${seed}: adjacent repeat at ${i}`);
    }
    for (const p of prompts) assert.ok(!banned.has(p), `seed ${seed}: ${p} is never drilled`);
    orders.add(prompts.join(","));
  }
  assert.ok(orders.size > 490, `seeds should shuffle differently (got ${orders.size} distinct orders)`);
});

test("buildDrillPrompts: degenerate rand (always 0 / always just under 1) still satisfies the constraints", () => {
  for (const r of [() => 0, () => 0.999999999]) {
    const prompts = buildDrillPrompts(r);
    assert.equal(prompts.length, 30);
    for (const c of DRILL_CHORDS) assert.equal(prompts.filter((p) => p === c).length, 3);
    for (let i = 1; i < prompts.length; i++) assert.notEqual(prompts[i], prompts[i - 1]);
  }
});

test("summarizeAttempts: accuracy and mean latency of correct attempts only", () => {
  const a = (expected: string, actual: string, latencyMs: number) => ({
    expected,
    actual,
    latencyMs,
    correct: expected === actual,
  });
  const summary = summarizeAttempts([
    a("cmd+c", "cmd+c", 400),
    a("cmd+c", "cmd+v", 100),
    a("cmd+c", "cmd+c", 600),
    a("ctrl+b", "cmd+b", 300),
    a("ctrl+b", "ctrl+c", 250),
    a("delete", "delete", 900),
  ]);

  assert.deepEqual(summary.overall, {
    attempts: 6,
    correct: 3,
    accuracy: 0.5,
    meanCorrectLatencyMs: (400 + 600 + 900) / 3,
  });

  assert.deepEqual(
    summary.perChord.map((p) => p.chord),
    [...DRILL_CHORDS],
    "one entry per drilled chord, in display order",
  );
  const by = new Map(summary.perChord.map((p) => [p.chord, p]));
  assert.deepEqual(by.get("cmd+c"), {
    chord: "cmd+c",
    attempts: 3,
    correct: 2,
    accuracy: 2 / 3,
    meanCorrectLatencyMs: 500,
  });
  assert.deepEqual(by.get("ctrl+b"), {
    chord: "ctrl+b",
    attempts: 2,
    correct: 0,
    accuracy: 0,
    meanCorrectLatencyMs: null,
  });
  assert.deepEqual(by.get("delete"), {
    chord: "delete",
    attempts: 1,
    correct: 1,
    accuracy: 1,
    meanCorrectLatencyMs: 900,
  });
  assert.deepEqual(by.get("cmd+v"), {
    chord: "cmd+v",
    attempts: 0,
    correct: 0,
    accuracy: 0,
    meanCorrectLatencyMs: null,
  });
});

test("summarizeAttempts: empty input", () => {
  const summary = summarizeAttempts([]);
  assert.deepEqual(summary.overall, { attempts: 0, correct: 0, accuracy: 0, meanCorrectLatencyMs: null });
  assert.equal(summary.perChord.length, DRILL_CHORDS.length);
  for (const p of summary.perChord) assert.equal(p.attempts, 0);
});
