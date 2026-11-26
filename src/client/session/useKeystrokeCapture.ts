import { useCallback, useEffect, useRef, useState } from "react";
import type { KeystrokeRecord } from "../../shared/types";
import { chordFromEvent, isDrillChord } from "../../shared/chords";
import { KeystrokeBuffer, type CharStatus } from "./keystrokeBuffer";

export interface Capture {
  cursor: number;
  statusAt: (i: number) => CharStatus;
  records: KeystrokeRecord[];
  done: boolean;
}

/**
 * Wire window keydown events to a KeystrokeBuffer. The keydown path does only
 * in-memory work (buffer mutation + a state bump to re-render) — never fetch or
 * any synchronous I/O — to keep within the <2ms/keystroke budget.
 */
export function useKeystrokeCapture(
  expected: string,
  active: boolean,
  onFirstKey?: () => void,
): { capture: Capture; reset: () => void } {
  const bufferRef = useRef<KeystrokeBuffer>(new KeystrokeBuffer(expected));
  // Re-render trigger only: the buffer is a mutable ref, so a counter is the simplest way to publish changes.
  const [, bump] = useState(0);
  const startedRef = useRef(false);

  const rebuild = useCallback(() => {
    bufferRef.current = new KeystrokeBuffer(expected);
    startedRef.current = false;
    bump((v) => v + 1);
  }, [expected]);

  useEffect(() => {
    rebuild();
  }, [rebuild]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        bufferRef.current.backspace();
        bump((v) => v + 1);
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        if (!startedRef.current) {
          startedRef.current = true;
          onFirstKey?.();
        }
        bufferRef.current.type(e.key);
        bump((v) => v + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onFirstKey]);

  const buf = bufferRef.current;
  const capture: Capture = {
    cursor: buf.cursor,
    statusAt: (i) => buf.statusAt(i),
    records: buf.records,
    done: buf.done,
  };

  return { capture, reset: rebuild };
}

/**
 * Shortcut-drill sibling of useKeystrokeCapture: the same window keydown
 * listener pattern, but for chords (modifiers + key) instead of typed text.
 * Like the hook above, the keydown path is in-memory only — never fetch.
 *
 * While `active`, every keydown with a chord (chordFromEvent not null) is
 * handled here:
 * - a drilled chord (isDrillChord) always has its default prevented, including
 *   auto-repeats and keydowns the caller ignores (e.g. during feedback), so ⌘S
 *   can't open a save dialog mid-drill;
 * - non-repeat keydowns go to `onChord`; when it returns true (the keydown was
 *   recorded as an attempt) the default is prevented too.
 *
 * When `active` is false no listener is attached, so nothing outside a drill is
 * touched.
 */
export function useChordCapture(
  active: boolean,
  onChord: (chord: string, e: KeyboardEvent) => boolean,
): void {
  // A ref, so the listener is attached once per activation and always calls
  // the latest callback without re-subscribing on every render.
  const onChordRef = useRef(onChord);
  onChordRef.current = onChord;

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      const chord = chordFromEvent(e);
      if (chord === null) return;
      if (isDrillChord(chord)) e.preventDefault();
      if (e.repeat) return;
      if (onChordRef.current(chord, e)) e.preventDefault();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);
}
