import { useMemo, useState } from "react";
import type { SessionKeyStat } from "../../shared/types";
import type { Keymap } from "../../server/keymap/types";
import { BOARD_HEIGHT, BOARD_WIDTH, KEY_LAYOUT } from "./glove80Layout";

type Metric = "speed" | "error";

const NO_DATA = "#222932";
const ERROR_FULL_SCALE = 0.25;

function hotColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const hue = 150 * (1 - clamped);
  return `hsl(${hue}, 68%, 45%)`;
}

function keyLabel(key: string): string {
  if (key === " ") return "sp";
  return key;
}

function labelFontSize(label: string): number {
  if (label.length <= 2) return 13;
  if (label.length <= 4) return 10;
  return 8;
}

/**
 * Build a map from typeable character → KEY_LAYOUT index using the base layer
 * (layer 0). Exported for unit testing.
 */
export function buildCharToKeyIndex(keymap: Keymap): Map<string, number> {
  const base = keymap.layers[0];
  if (!base) return new Map();
  const m = new Map<string, number>();
  for (let i = 0; i < base.bindings.length; i++) {
    const ch = base.bindings[i].char;
    if (ch !== null && !m.has(ch)) m.set(ch, i);
  }
  return m;
}

export function HeatMap({
  keymap,
  keyStats,
  initialMetric = "speed",
  showToggle = true,
}: {
  keymap: Keymap;
  keyStats: SessionKeyStat[];
  initialMetric?: Metric;
  showToggle?: boolean;
}) {
  const [metric, setMetric] = useState<Metric>(initialMetric);

  const byKey = useMemo(() => {
    const m = new Map<string, SessionKeyStat>();
    for (const s of keyStats) m.set(s.key, s);
    return m;
  }, [keyStats]);

  const { minLat, maxLat } = useMemo(() => {
    const lats = keyStats.filter((s) => s.samples > 0).map((s) => s.meanLatencyMs);
    return { minLat: Math.min(...lats), maxLat: Math.max(...lats) };
  }, [keyStats]);

  const baseLayer = keymap.layers[0];

  function colorFor(stat: SessionKeyStat | undefined): string {
    if (!stat || stat.samples === 0) return NO_DATA;
    if (metric === "error") return hotColor(stat.errorRate / ERROR_FULL_SCALE);
    if (!isFinite(minLat) || maxLat === minLat) return hotColor(0.5);
    return hotColor((stat.meanLatencyMs - minLat) / (maxLat - minLat));
  }

  return (
    <div className="inline-block">
      {showToggle && (
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
          <span>color by</span>
          {(["speed", "error"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded px-2 py-0.5 ${
                metric === m ? "bg-accent text-ink-bg" : "bg-ink-surface text-ink-text"
              }`}
            >
              {m === "speed" ? "speed" : "errors"}
            </button>
          ))}
        </div>
      )}
      <svg
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        role="img"
        aria-label="per-key heat map"
        className="max-w-full"
      >
        {KEY_LAYOUT.map((geom, i) => {
          const binding = baseLayer?.bindings[i];
          const ch = binding?.char ?? null;
          const stat = ch !== null ? byKey.get(ch) : undefined;
          const rawLabel = ch !== null ? keyLabel(ch) : (binding?.glyph ?? "");
          const label = rawLabel.length > 6 ? rawLabel.slice(0, 5) + "…" : rawLabel;
          const hasData = stat !== undefined && stat.samples > 0;
          return (
            <g key={i}>
              <rect
                x={geom.x}
                y={geom.y}
                width={geom.w}
                height={geom.h}
                rx={6}
                fill={colorFor(stat)}
                stroke={geom.thumb ? "#e2b714" : "#2a313b"}
                strokeWidth={geom.thumb ? 1.5 : 1}
              />
              <text
                x={geom.x + geom.w / 2}
                y={geom.y + geom.h / 2 + labelFontSize(label) / 3}
                textAnchor="middle"
                fontSize={labelFontSize(label)}
                fill={hasData ? "#0c0f12" : "#5a6573"}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        <span>{metric === "speed" ? "faster" : "fewer errors"}</span>
        <div
          className="h-2 w-32 rounded"
          style={{ background: `linear-gradient(90deg, ${hotColor(0)}, ${hotColor(1)})` }}
        />
        <span>{metric === "speed" ? "slower" : "more errors"}</span>
      </div>
    </div>
  );
}
