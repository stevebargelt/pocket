import type { LayerInfo } from "../api";

/** What the picker currently has selected: a specific layer (by binding index)
 *  or the thumb cluster. Layers can always be *viewed*; only `drillable` ones
 *  (and the thumb cluster) can be turned into a scored drill. */
export type LayerSelection = { kind: "layer"; index: number } | { kind: "thumb" };

function sameSelection(a: LayerSelection, b: LayerSelection): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "layer" && b.kind === "layer" ? a.index === b.index : true;
}

/**
 * Segmented control for choosing a keymap layer (or the thumb cluster) to focus.
 * Modeled on ContextPicker: shown only on the idle Practice landing and only when
 * a keymap is loaded (it returns null otherwise). Selecting a layer drives the
 * live KeymapView's displayed layer; selecting "thumb cluster" highlights the
 * thumb keys. Non-drillable layers stay selectable for viewing but are marked so
 * the choice isn't communicated by color alone.
 */
export function LayerPicker({
  layers,
  value,
  onChange,
}: {
  layers: LayerInfo[];
  value: LayerSelection;
  onChange: (selection: LayerSelection) => void;
}) {
  if (layers.length === 0) return null;

  return (
    <div className="mx-auto mb-4 flex max-w-2xl flex-col items-center gap-1">
      <div
        role="radiogroup"
        aria-label="keymap layer to focus"
        className="inline-flex flex-wrap justify-center gap-1 rounded-lg border border-ink-border bg-ink-surface p-1"
      >
        {layers.map((layer) => {
          const selection: LayerSelection = { kind: "layer", index: layer.index };
          const active = sameSelection(value, selection);
          return (
            <button
              key={layer.index}
              role="radio"
              aria-checked={active}
              aria-label={
                layer.drillable
                  ? `${layer.name} layer`
                  : `${layer.name} layer — view only, no typeable keys to drill`
              }
              title={layer.drillable ? undefined : "no typeable keys on this layer — view only"}
              onClick={() => onChange(selection)}
              className={`rounded px-3 py-1 text-sm ${
                active
                  ? "bg-accent font-medium text-ink-bg"
                  : "text-ink-muted hover:text-ink-text"
              }`}
            >
              {layer.name}
              {!layer.drillable && (
                <span className={active ? "text-ink-bg/70" : "text-ink-muted"}> ·view</span>
              )}
            </button>
          );
        })}

        <button
          role="radio"
          aria-checked={value.kind === "thumb"}
          aria-label="thumb cluster"
          onClick={() => onChange({ kind: "thumb" })}
          className={`rounded px-3 py-1 text-sm ${
            value.kind === "thumb"
              ? "bg-accent font-medium text-ink-bg"
              : "text-ink-muted hover:text-ink-text"
          }`}
        >
          thumb cluster
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        pick a layer or the thumb cluster to drill — “·view” layers bind no typeable keys
      </p>
    </div>
  );
}
