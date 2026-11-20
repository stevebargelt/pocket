import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ShortcutAttemptPayload } from "../../shared/types";
import { chordLabel, type DrillChord } from "../../shared/chords";
import { useChordCapture } from "../session/useKeystrokeCapture";

/** How long the ✓ / ✗ feedback shows after each attempt before the next prompt. */
export const FEEDBACK_MS = 400;

/** A finished drill, ready to summarise and save. */
export interface ShortcutDrillResult {
  attempts: ShortcutAttemptPayload[];
  startedAt: number;
  endedAt: number;
  /** Idempotency key for the save, generated once when the drill finishes. */
  clientId: string;
}

interface Feedback {
  expected: string;
  actual: string;
}

/**
 * One shortcut drill: shows each prompt in turn and records the first chord
 * pressed for it (one attempt per prompt, no retry). Esc aborts without saving.
 * The keydown path stays in-memory; saving happens in ShortcutResults.
 */
export function ShortcutDrill({
  prompts,
  onFinish,
  onAbort,
  feedbackMs = FEEDBACK_MS,
}: {
  prompts: readonly DrillChord[];
  onFinish: (r: ShortcutDrillResult) => void;
  onAbort: () => void;
  feedbackMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Refs mirror the state the keydown handler reads, so it never sees a stale render.
  const indexRef = useRef(0);
  const inFeedbackRef = useRef(false);
  const doneRef = useRef(false);
  const shownAtRef = useRef(0);
  const startedAtRef = useRef(Date.now());
  const attemptsRef = useRef<ShortcutAttemptPayload[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The prompt is on screen once this commit lands: start its latency clock.
  useLayoutEffect(() => {
    shownAtRef.current = performance.now();
  }, [index]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const onChord = useCallback(
    (chord: string, e: KeyboardEvent): boolean => {
      if (doneRef.current) return false;
      if (e.key === "Escape") {
        doneRef.current = true;
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        onAbort();
        return false;
      }
      if (inFeedbackRef.current) return false;

      const i = indexRef.current;
      const expected = prompts[i];
      attemptsRef.current.push({
        index: i,
        expected,
        actual: chord,
        latencyMs: Math.round(performance.now() - shownAtRef.current),
      });
      inFeedbackRef.current = true;
      setFeedback({ expected, actual: chord });

      const last = i + 1 >= prompts.length;
      const endedAt = Date.now();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        inFeedbackRef.current = false;
        if (last) {
          doneRef.current = true;
          onFinish({
            attempts: attemptsRef.current,
            startedAt: startedAtRef.current,
            endedAt,
            clientId: crypto.randomUUID(),
          });
          return;
        }
        indexRef.current = i + 1;
        setIndex(i + 1);
        setFeedback(null);
      }, feedbackMs);
      return true;
    },
    [prompts, onFinish, onAbort, feedbackMs],
  );

  useChordCapture(true, onChord);

  const prompt = prompts[index];

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
      <div className="flex w-full items-center justify-between text-sm text-ink-muted">
        <span>shortcut drill</span>
        <span data-testid="drill-progress">
          {index + 1} / {prompts.length}
        </span>
      </div>

      <div
        data-testid="drill-prompt"
        className="rounded-lg border border-ink-border bg-ink-surface px-12 py-8 font-mono text-7xl text-ink-bright"
      >
        {chordLabel(prompt)}
      </div>

      <p data-testid="drill-feedback" className="h-6 text-lg">
        {feedback &&
          (feedback.actual === feedback.expected ? (
            <span className="text-accent">✓ {chordLabel(feedback.expected)}</span>
          ) : (
            <span className="text-err">
              ✗ pressed {chordLabel(feedback.actual)}, wanted {chordLabel(feedback.expected)}
            </span>
          ))}
      </p>

      <p className="text-xs text-ink-muted">press the shortcut shown · esc to quit</p>
    </div>
  );
}
