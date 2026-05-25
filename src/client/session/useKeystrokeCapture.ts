import { useCallback, useEffect, useRef, useState } from "react";
import type { KeystrokeRecord } from "../../shared/types";
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
