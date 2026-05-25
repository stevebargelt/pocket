import { useMemo, useState } from "react";
import type { SessionKeyStat } from "../../shared/types";

type Metric = "speed" | "error";

const ROWS: string[][] = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];

const UNIT = 38;
const GAP = 5;
const ROW_INDENT = [0, 0.5, 0.8, 1.2];

const NO_DATA = "#222932";
const ERROR_FULL_SCALE = 0.25; // 25% error rate == fully hot

function hotColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const hue = 150 * (1 - clamped); // 150 = green (good), 0 = red (bad)
  return `hsl(${hue}, 68%, 45%)`;
}

function keyLabel(key: string): string {
  if (key === " ") return "space";
  return key;
}

export function HeatMap({
  keyStats,
  initialMetric = "speed",
  showToggle = true,
}: {
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

  function colorFor(stat: SessionKeyStat | undefined): string {
    if (!stat || stat.samples === 0) return NO_DATA;
    if (metric === "error") return hotColor(stat.errorRate / ERROR_FULL_SCALE);
    if (!isFinite(minLat) || maxLat === minLat) return hotColor(0.5);
    return hotColor((stat.meanLatencyMs - minLat) / (maxLat - minLat));
  }

  const width = 13 * (UNIT + GAP) + UNIT * 2;
  const height = (ROWS.length + 1) * (UNIT + GAP) + GAP;

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
      <svg width={width} height={height} role="img" aria-label="per-key heat map">
        {ROWS.map((row, r) =>
          row.map((key, c) => {
            const stat = byKey.get(key);
            const x = GAP + (c + ROW_INDENT[r]) * (UNIT + GAP);
            const y = GAP + r * (UNIT + GAP);
            return (
              <g key={`${r}-${c}`}>
                <rect x={x} y={y} width={UNIT} height={UNIT} rx={5} fill={colorFor(stat)} />
                <text
                  x={x + UNIT / 2}
                  y={y + UNIT / 2 + 4}
                  textAnchor="middle"
                  fontSize="13"
                  fill={stat && stat.samples > 0 ? "#0c0f12" : "#5a6573"}
                >
                  {keyLabel(key)}
                </text>
              </g>
            );
          }),
        )}
        {/* space bar */}
        {(() => {
          const stat = byKey.get(" ");
          const y = GAP + ROWS.length * (UNIT + GAP);
          const x = GAP + 3 * (UNIT + GAP);
          const w = 6 * (UNIT + GAP) - GAP;
          return (
            <g>
              <rect x={x} y={y} width={w} height={UNIT} rx={5} fill={colorFor(stat)} />
              <text
                x={x + w / 2}
                y={y + UNIT / 2 + 4}
                textAnchor="middle"
                fontSize="12"
                fill={stat && stat.samples > 0 ? "#0c0f12" : "#5a6573"}
              >
                space
              </text>
            </g>
          );
        })()}
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
