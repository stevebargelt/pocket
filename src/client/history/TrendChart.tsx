import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryEntry } from "../../shared/types";

export function TrendChart({ history }: { history: HistoryEntry[] }) {
  const data = history.map((h, i) => ({
    session: i + 1,
    date: new Date(h.startedAt).toLocaleDateString(),
    wpm: Math.round(h.wpm),
    awpm: Math.round(h.accurateWpm),
    errorPct: Number((h.errorRate * 100).toFixed(1)),
  }));

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#2a313b" strokeDasharray="3 3" />
          <XAxis dataKey="session" stroke="#6b7686" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="wpm" stroke="#6b7686" tick={{ fontSize: 12 }} />
          <YAxis
            yAxisId="err"
            orientation="right"
            stroke="#ca4754"
            tick={{ fontSize: 12 }}
            unit="%"
          />
          <Tooltip
            contentStyle={{ background: "#1a1f26", border: "1px solid #2a313b", color: "#c9d3e0" }}
            labelFormatter={(s) => `session ${s} · ${data[(s as number) - 1]?.date ?? ""}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="wpm" type="monotone" dataKey="wpm" name="raw wpm" stroke="#e2b714" dot={false} />
          <Line
            yAxisId="wpm"
            type="monotone"
            dataKey="awpm"
            name="accurate wpm"
            stroke="#7fb3ff"
            dot={false}
          />
          <Line
            yAxisId="err"
            type="monotone"
            dataKey="errorPct"
            name="error %"
            stroke="#ca4754"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
