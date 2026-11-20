// Shared chord model for the shortcut drill. Imported by both client and server,
// so it must stay free of Node and DOM imports.
//
// A chord id is the held modifiers in the fixed order ctrl, alt, shift, cmd,
// then the key, joined by "+": `cmd+c`, `ctrl+b`, `shift+cmd+z`, `backspace`, `x`.

import { SHORTCUT_DRILL_REPS } from "./constants";
import type { ShortcutChordStats, ShortcutDrillSummary, ShortcutStats } from "./types";

/** The drilled chords, in display order. ⌘W ⌘T ⌘Q ⌘R ⌘N are never drilled: the browser takes them first. */
export const DRILL_CHORDS = [
  "cmd+c",
  "cmd+v",
  "cmd+a",
  "cmd+x",
  "cmd+z",
  "cmd+s",
  "ctrl+c",
  "ctrl+b",
  "backspace",
  "delete",
] as const;

export type DrillChord = (typeof DRILL_CHORDS)[number];

/** Modifier id prefixes in chord-id order, with their Mac glyphs (Apple's ⌃⌥⇧⌘ order). */
const MODIFIERS = [
  { id: "ctrl", glyph: "⌃" },
  { id: "alt", glyph: "⌥" },
  { id: "shift", glyph: "⇧" },
  { id: "cmd", glyph: "⌘" },
] as const;

/** `e.key` values that are a modifier or lock on their own, never a chord. */
const NON_CHORD_KEYS = new Set([
  "Meta",
  "Control",
  "Alt",
  "Shift",
  "CapsLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "OS",
  "Dead",
  "Unidentified",
]);

/** Named keys with a dedicated Mac glyph. */
const KEY_GLYPHS: Record<string, string> = {
  backspace: "⌫",
  delete: "⌦",
};

/** The fields of a keydown event chordFromEvent reads; a plain object so it is testable in Node. */
export interface ChordEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** The chord id for a keydown, or null when the key is a lone modifier or lock key. */
export function chordFromEvent(e: ChordEventLike): string | null {
  if (e.key === "" || NON_CHORD_KEYS.has(e.key)) return null;
  const key = e.key === " " ? "space" : e.key.toLowerCase();
  const held = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, cmd: e.metaKey };
  const mods = MODIFIERS.filter((m) => held[m.id]).map((m) => m.id);
  return [...mods, key].join("+");
}

export function isDrillChord(id: unknown): id is DrillChord {
  return (DRILL_CHORDS as readonly unknown[]).includes(id);
}

/**
 * Split a chord id into its modifiers and key by stripping known modifier
 * prefixes in order, so a key that is itself "+" (`cmd++`) still parses.
 */
function parseChord(id: string): { mods: string[]; key: string } {
  const mods: string[] = [];
  let rest = id;
  for (const m of MODIFIERS) {
    const prefix = `${m.id}+`;
    if (rest.startsWith(prefix) && rest.length > prefix.length) {
      mods.push(m.glyph);
      rest = rest.slice(prefix.length);
    }
  }
  return { mods, key: rest };
}

/** Mac glyph label for a chord id: `cmd+c` → `⌘C`, `shift+cmd+z` → `⇧⌘Z`, `backspace` → `⌫`. */
export function chordLabel(id: string): string {
  const { mods, key } = parseChord(id);
  let keyLabel: string;
  if (KEY_GLYPHS[key] !== undefined) keyLabel = KEY_GLYPHS[key];
  else if ([...key].length === 1) keyLabel = key.toUpperCase();
  else keyLabel = key.charAt(0).toUpperCase() + key.slice(1);
  return mods.join("") + keyLabel;
}

/**
 * Whether `remaining` counts can be laid out with no two equal neighbours when
 * the item placed just before them was `prev`.
 */
function arrangeable(remaining: Map<DrillChord, number>, prev: DrillChord | null): boolean {
  let total = 0;
  for (const n of remaining.values()) total += n;
  for (const [chord, n] of remaining) {
    const cap = chord === prev ? Math.floor(total / 2) : Math.ceil(total / 2);
    if (n > cap) return false;
  }
  return true;
}

/**
 * The prompts for one drill: every DRILL_CHORDS entry SHORTCUT_DRILL_REPS times,
 * shuffled, never the same chord twice in a row. Each step draws a chord with
 * probability proportional to its remaining count (a shuffle), restricted to
 * chords that differ from the previous one and leave the rest arrangeable, so it
 * always terminates whatever `rand` returns.
 */
export function buildDrillPrompts(rand: () => number = Math.random): DrillChord[] {
  const remaining = new Map<DrillChord, number>(DRILL_CHORDS.map((c) => [c, SHORTCUT_DRILL_REPS]));
  const total = DRILL_CHORDS.length * SHORTCUT_DRILL_REPS;
  const out: DrillChord[] = [];
  let prev: DrillChord | null = null;

  while (out.length < total) {
    const candidates: Array<[DrillChord, number]> = [];
    for (const [chord, n] of remaining) {
      if (n === 0 || chord === prev) continue;
      remaining.set(chord, n - 1);
      if (arrangeable(remaining, chord)) candidates.push([chord, n]);
      remaining.set(chord, n);
    }
    const weight = candidates.reduce((sum, [, n]) => sum + n, 0);
    let r = Math.min(Math.max(rand(), 0), 1 - Number.EPSILON) * weight;
    let pick = candidates[candidates.length - 1][0];
    for (const [chord, n] of candidates) {
      if (r < n) {
        pick = chord;
        break;
      }
      r -= n;
    }
    remaining.set(pick, remaining.get(pick)! - 1);
    out.push(pick);
    prev = pick;
  }
  return out;
}

interface AttemptLike {
  expected: string;
  actual: string;
  latencyMs: number;
  correct: boolean;
}

function stats(attempts: readonly AttemptLike[]): ShortcutStats {
  const correct = attempts.filter((a) => a.correct);
  return {
    attempts: attempts.length,
    correct: correct.length,
    accuracy: attempts.length === 0 ? 0 : correct.length / attempts.length,
    meanCorrectLatencyMs:
      correct.length === 0 ? null : correct.reduce((sum, a) => sum + a.latencyMs, 0) / correct.length,
  };
}

/**
 * Accuracy and speed overall and per drilled chord. `perChord` has one entry per
 * DRILL_CHORDS chord in display order, including chords with no attempts. Speed
 * is the mean latency of correct attempts only.
 */
export function summarizeAttempts(attempts: readonly AttemptLike[]): ShortcutDrillSummary {
  const perChord: ShortcutChordStats[] = DRILL_CHORDS.map((chord) => ({
    chord,
    ...stats(attempts.filter((a) => a.expected === chord)),
  }));
  return { overall: stats(attempts), perChord };
}
