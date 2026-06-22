import { useCallback, useEffect, useRef, useState } from "react";
import type { KeystrokeRecord } from "../../shared/types";
import { computeMetrics } from "../../shared/metrics";
import { useKeystrokeCapture } from "./useKeystrokeCapture";

export interface SessionResult {
  keystrokes: KeystrokeRecord[];
  startedAt: number;
  endedAt: number;
}

export function TypingSurface({
  text,
  durationSeconds,
  onComplete,
}: {
  text: string;
  durationSeconds: number;
  onComplete: (r: SessionResult) => void;
}) {
  const [started, setStarted] = useState(false);
  const [remaining, setRemaining] = useState(durationSeconds);
  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);

  const onFirstKey = useCallback(() => {
    startedAtRef.current = Date.now();
    setStarted(true);
  }, []);

  const { capture } = useKeystrokeCapture(text, true, onFirstKey);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onComplete({
      keystrokes: capture.records,
      startedAt: startedAtRef.current || Date.now(),
      endedAt: Date.now(),
    });
  }, [capture.records, onComplete]);

  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      if (durationSeconds === 0) {
        setRemaining(Math.ceil(elapsed));
      } else {
        setRemaining(Math.max(0, Math.ceil(durationSeconds - elapsed)));
        if (elapsed >= durationSeconds) finish();
      }
    }, 250);
    return () => clearInterval(id);
  }, [started, durationSeconds, finish]);

  useEffect(() => {
    if (started && capture.done) finish();
  }, [started, capture.done, finish]);

  const elapsedMs = started ? Date.now() - startedAtRef.current : 0;
  const live = computeMetrics(capture.records, Math.max(elapsedMs, 1));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between text-sm text-ink-muted">
        <div className="flex gap-6">
          <span>
            <span className="text-accent text-lg font-semibold">{remaining}</span> s
          </span>
          <span>
            wpm <span className="text-ink-bright">{Math.round(live.wpm)}</span>
          </span>
          <span>
            acc wpm <span className="text-ink-bright">{Math.round(live.accurateWpm)}</span>
          </span>
          <span>
            err <span className="text-ink-bright">{(live.errorRate * 100).toFixed(0)}%</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          {!started && <span className="text-ink-muted">just start typing…</span>}
          {started && (
            <button
              onClick={finish}
              className="rounded border border-ink-border px-2 py-0.5 text-xs text-ink-muted hover:border-accent hover:text-ink-text"
            >
              stop
            </button>
          )}
        </div>
      </div>

      <div className="select-none whitespace-pre-wrap break-words font-mono text-2xl leading-relaxed tracking-wide">
        {Array.from(text).map((ch, i) => {
          const st = capture.statusAt(i);
          const isCurrent = i === capture.cursor;
          const cls =
            st === "correct"
              ? "text-ink-bright"
              : st === "wrong"
                ? "text-err underline decoration-err"
                : "text-ink-muted";
          return (
            <span key={i} className={`${cls} ${isCurrent ? "caret" : ""}`}>
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
}
