import { useMemo } from "react";
import type { Binding, Keymap } from "../../server/keymap/types";
import { BOARD_HEIGHT, BOARD_WIDTH, KEY_LAYOUT } from "./glove80Layout";

// Live render of the user's parsed ZMK keymap on a hand-rolled Glove 80 SVG.
// Closes backlog #5 (HeatMap.tsx hardcoded QWERTY): glyphs come straight from the
// parsed bindings, so Mac modifier keys show ⌘/⌥/⌃/⇧ and shifted symbols show
// their resolved character. HeatMap.tsx is untouched — it stays as the per-key
// results render and the no-keymap fallback.

const MAC_MODS = ["⌘", "⌥", "⌃", "⇧"];

type CellKind = "char" | "mod" | "layer" | "trans" | "blank" | "raw";

function cellKind(b: Binding): CellKind {
  if (b.behavior === "none" || b.glyph === "") return "blank";
  if (b.behavior === "trans") return "trans";
  if (b.behavior === "mo" || b.behavior === "to" || b.behavior === "tog") return "layer";
  if (b.char !== null) return "char";
  if (MAC_MODS.includes(b.glyph)) return "mod";
  if (!b.known) return "raw";
  return "char";
}

// Palette keyed off the ink/accent theme so cells read on the dark surface.
const FILL: Record<CellKind, string> = {
  char: "#222a34",
  mod: "#3a3320",
  layer: "#26333f",
  trans: "#1a1f26",
  blank: "#161a20",
  raw: "#2e2530",
};
const STROKE: Record<CellKind, string> = {
  char: "#2a313b",
  mod: "#8a7320",
  layer: "#3a5066",
  trans: "#2a313b",
  blank: "#21262e",
  raw: "#5a4a64",
};
const TEXT: Record<CellKind, string> = {
  char: "#c9d3e0",
  mod: "#e2b714",
  layer: "#7fb0d8",
  trans: "#4a5563",
  blank: "#2a313b",
  raw: "#b89ccc",
};

function relativeTime(epochMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Shrink the font for multi-character glyphs (e.g. "LLower", "PgUp", "F12") so
// they fit a key cell without overflowing.
function fontSizeFor(glyph: string): number {
  if (glyph.length <= 1) return 16;
  if (glyph.length <= 3) return 11;
  if (glyph.length <= 5) return 9;
  return 8;
}

// Raw tokens for unrecognised behaviors (e.g. "&magic LAYER_Magic 0") can be far
// wider than a key cell — clip the display glyph; the full token stays in <title>.
function displayGlyph(glyph: string): string {
  return glyph.length > 7 ? `${glyph.slice(0, 6)}…` : glyph;
}

function ModifierStatus({ held }: { held: string[] }) {
  return (
    <div className="flex items-center gap-1.5" aria-label="held modifiers">
      {MAC_MODS.map((m) => {
        const active = held.includes(m);
        return (
          <span
            key={m}
            className={`flex h-7 w-7 items-center justify-center rounded text-base ${
              active
                ? "bg-accent text-ink-bg"
                : "border border-ink-border bg-ink-surface text-ink-muted"
            }`}
          >
            {m}
          </span>
        );
      })}
    </div>
  );
}

export function KeymapView({
  keymap,
  activeLayerIndex = 0,
  heldModifiers = [],
  fingerprintChanged = false,
  updatedAt = null,
}: {
  /** The parsed keymap (null when no keymap file is configured — App falls back to HeatMap). */
  keymap: Keymap | null;
  /** Which layer to render; defaults to the base layer. */
  activeLayerIndex?: number;
  /** Mac modifier glyphs currently held (⌘/⌥/⌃/⇧), shown highlighted. */
  heldModifiers?: string[];
  /** When true, surface a "fingerprint changed" badge after a re-export. */
  fingerprintChanged?: boolean;
  /** Epoch ms of the last keymap parse, for the "layout updated <time> ago" note. */
  updatedAt?: number | null;
}) {
  const layers = keymap?.layers ?? [];
  const safeIndex = Math.min(Math.max(activeLayerIndex, 0), Math.max(layers.length - 1, 0));
  const layer = layers[safeIndex];

  const now = useMemo(() => Date.now(), [updatedAt]);

  if (!keymap || layers.length === 0 || !layer) {
    return (
      <div className="text-sm text-ink-muted" role="status">
        No keymap loaded.
      </div>
    );
  }

  const bindings = layer.bindings;
  const wellFormed = bindings.length === KEY_LAYOUT.length;

  return (
    <div className="inline-block">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Layer indicator: all layer names, active one highlighted. */}
        <div className="flex items-center gap-2" aria-label="active layer">
          <span className="text-xs uppercase tracking-wide text-ink-muted">layer</span>
          <div className="flex flex-wrap gap-1">
            {layers.map((l, i) => (
              <span
                key={`${l.name}-${i}`}
                aria-current={i === safeIndex ? "true" : undefined}
                className={`rounded px-2 py-0.5 text-sm ${
                  i === safeIndex
                    ? "bg-accent font-medium text-ink-bg"
                    : "bg-ink-surface text-ink-muted"
                }`}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-ink-muted">held</span>
          <ModifierStatus held={heldModifiers} />
        </div>
      </div>

      {updatedAt !== null && (
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
          <span>layout updated {relativeTime(updatedAt, now)}</span>
          {fingerprintChanged && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 font-medium text-accent">
              fingerprint changed
            </span>
          )}
        </div>
      )}

      {wellFormed ? (
        <svg
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
          role="img"
          aria-label={`Glove 80 keymap, ${layer.name} layer`}
          className="max-w-full"
        >
          {KEY_LAYOUT.map((geom, i) => {
            const b = bindings[i];
            const kind = cellKind(b);
            const glyph = displayGlyph(b.glyph);
            return (
              <g key={i}>
                <rect
                  x={geom.x}
                  y={geom.y}
                  width={geom.w}
                  height={geom.h}
                  rx={6}
                  fill={FILL[kind]}
                  stroke={geom.thumb ? "#e2b714" : STROKE[kind]}
                  strokeWidth={geom.thumb ? 1.5 : 1}
                />
                <title>{`${geom.pos}: ${b.raw}`}</title>
                <text
                  x={geom.x + geom.w / 2}
                  y={geom.y + geom.h / 2 + fontSizeFor(glyph) / 3}
                  textAnchor="middle"
                  fontSize={fontSizeFor(glyph)}
                  fill={TEXT[kind]}
                >
                  {glyph}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        // Binding count ≠ 80: don't mis-place keys on the fixed geometry — show a
        // safe flat view instead.
        <div className="max-w-[720px]">
          <div className="mb-2 text-xs text-err">
            layer has {bindings.length} bindings (expected {KEY_LAYOUT.length}) — showing flat view
          </div>
          <div className="flex flex-wrap gap-1">
            {bindings.map((b, i) => {
              const kind = cellKind(b);
              return (
                <span
                  key={i}
                  title={b.raw}
                  className="flex h-9 min-w-[2.25rem] items-center justify-center rounded px-1 text-sm"
                  style={{ background: FILL[kind], color: TEXT[kind], border: `1px solid ${STROKE[kind]}` }}
                >
                  {displayGlyph(b.glyph)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <LegendDot color={FILL.char} stroke={STROKE.char} label="key" />
        <LegendDot color={FILL.mod} stroke={STROKE.mod} label="modifier" />
        <LegendDot color={FILL.layer} stroke={STROKE.layer} label="layer" />
        <LegendDot color={FILL.trans} stroke={STROKE.trans} label="transparent" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border-2 border-accent" />
          thumb cluster
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, stroke, label }: { color: string; stroke: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ background: color, border: `1px solid ${stroke}` }}
      />
      {label}
    </span>
  );
}
