import type { KeystrokeRecord, SessionMetrics } from "./types";
import { CHARS_PER_WORD } from "./constants";

// The ONE definition of typing metrics, shared by the live UI, the save path,
// and history. Monkeytype-style rule: a character that was typed wrong counts
// as an error for accuracy/error-rate even if it was later corrected; the
// accurate (net) WPM credits only the final correct characters.
//
// The keystroke buffer records one entry per character-producing keypress
// (backspaces are not recorded — they just let the user re-enter a position).
// So a corrected error appears as a `correct: false` attempt followed by a
// `correct: true` attempt at the same index: it inflates raw WPM and the error
// count, but accurate WPM only ever counts the correct attempts.

function minutesFrom(elapsedMs: number): number {
  return elapsedMs / 60_000;
}

/** All typed characters / 5 / minutes (corrections included). */
export function rawWpm(totalKeystrokes: number, elapsedMs: number): number {
  const minutes = minutesFrom(elapsedMs);
  if (minutes <= 0) return 0;
  return totalKeystrokes / CHARS_PER_WORD / minutes;
}

/** Final correct characters / 5 / minutes. */
export function accurateWpm(correctKeystrokes: number, elapsedMs: number): number {
  const minutes = minutesFrom(elapsedMs);
  if (minutes <= 0) return 0;
  return correctKeystrokes / CHARS_PER_WORD / minutes;
}

/** Fraction of keypresses that were wrong (0..1). */
export function errorRate(errorKeystrokes: number, totalKeystrokes: number): number {
  if (totalKeystrokes <= 0) return 0;
  return errorKeystrokes / totalKeystrokes;
}

export function computeMetrics(
  keystrokes: KeystrokeRecord[],
  elapsedMs: number,
): SessionMetrics {
  const totalKeystrokes = keystrokes.length;
  let errorKeystrokes = 0;
  for (const k of keystrokes) {
    if (!k.correct) errorKeystrokes++;
  }
  const correctKeystrokes = totalKeystrokes - errorKeystrokes;
  return {
    wpm: rawWpm(totalKeystrokes, elapsedMs),
    accurateWpm: accurateWpm(correctKeystrokes, elapsedMs),
    errorRate: errorRate(errorKeystrokes, totalKeystrokes),
    totalKeystrokes,
    correctKeystrokes,
    errorKeystrokes,
  };
}
