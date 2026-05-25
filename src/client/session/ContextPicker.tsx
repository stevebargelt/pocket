import { CONTEXTS, CONTEXT_LABELS, type Context } from "../../shared/constants";

/** Segmented control for choosing the practice context. Shown only on the idle
 *  Practice landing; it disappears once typing starts to keep the flow clean. */
export function ContextPicker({
  value,
  onChange,
}: {
  value: Context;
  onChange: (context: Context) => void;
}) {
  return (
    <div className="mx-auto mb-4 flex max-w-2xl justify-center">
      <div
        role="radiogroup"
        aria-label="practice context"
        className="inline-flex gap-1 rounded-lg border border-ink-border bg-ink-surface p-1"
      >
        {CONTEXTS.map((context) => {
          const active = context === value;
          return (
            <button
              key={context}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(context)}
              className={`rounded px-3 py-1 text-sm ${
                active
                  ? "bg-accent font-medium text-ink-bg"
                  : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {CONTEXT_LABELS[context]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
