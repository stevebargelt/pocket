// jsdom tests for the accessibility pass (#21): ARIA state, heading, and a heat
// map that carries its values without colour.
import { mockFetch } from "./helpers/dom";

import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/client/App";
import { HistoryView } from "../src/client/history/HistoryView";
import { HeatMap, HATCH_OPACITY, HATCH_STRIPE, LABEL_COLOR, HOT_THRESHOLD, hotColor } from "../src/client/components/HeatMap";
import type { Keymap, Binding } from "../src/server/keymap/types";
import type { SessionKeyStat } from "../src/shared/types";

function b(char: string | null): Binding {
  return { raw: "&kp", behavior: "kp", params: [], known: true, glyph: char ?? "", char };
}

function makeKeymap(chars: string[]): Keymap {
  const bindings = chars.map(b);
  while (bindings.length < 80) bindings.push(b(null));
  return { layers: [{ name: "Base", bindings }], sourcePath: null, parsedAt: 0 };
}

const STATS: SessionKeyStat[] = [
  { key: "a", meanLatencyMs: 100, errorRate: 0, samples: 10 },
  { key: "b", meanLatencyMs: 200, errorRate: 0.05, samples: 10 },
  { key: "c", meanLatencyMs: 400, errorRate: 0.25, samples: 10 },
];

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setImmediate(r));
    });
  }
}

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  mockFetch({
    "GET /api/keymap": null,
    "GET /api/layers": [],
    "GET /api/recommendation": {
      hasEnoughData: false,
      weakKeys: [],
      weakBigrams: [],
      targetMinutes: 5,
      why: "Not enough data yet.",
      isHeuristic: true,
    },
    "GET /api/text": { mode: "random", targetedBigrams: [], lines: ["hello"], text: "hello" },
  });
});

afterEach(cleanup);

test("brand is an h1 and the active nav button has aria-current=page", async () => {
  render(<App />);
  await flush();
  assert.equal(screen.getByRole("heading", { level: 1 }).textContent, "Pocket");
  const practice = screen.getByRole("button", { name: "practice" });
  const history = screen.getByRole("button", { name: "history" });
  assert.equal(practice.getAttribute("aria-current"), "page");
  assert.equal(history.getAttribute("aria-current"), null);
  fireEvent.click(history);
  await flush();
  assert.equal(history.getAttribute("aria-current"), "page");
  assert.equal(practice.getAttribute("aria-current"), null);
});

test("heat-map metric toggle is a labelled group with aria-pressed", () => {
  render(<HeatMap keymap={makeKeymap(["a", "b", "c"])} keyStats={STATS} />);
  const group = screen.getByRole("group", { name: "color by" });
  const speed = screen.getByRole("button", { name: "speed" });
  const errors = screen.getByRole("button", { name: "errors" });
  assert.ok(group.contains(speed) && group.contains(errors));
  assert.equal(speed.getAttribute("aria-pressed"), "true");
  assert.equal(errors.getAttribute("aria-pressed"), "false");
  fireEvent.click(errors);
  assert.equal(speed.getAttribute("aria-pressed"), "false");
  assert.equal(errors.getAttribute("aria-pressed"), "true");
});

test("heat map gives each key a value title and hatches the hottest keys", () => {
  const { container } = render(<HeatMap keymap={makeKeymap(["a", "b", "c"])} keyStats={STATS} />);
  const titles = Array.from(container.querySelectorAll("svg title")).map((t) => t.textContent ?? "");
  assert.ok(titles.some((t) => t.startsWith("a: 100 ms mean latency") && !t.includes("hatched")));
  assert.ok(titles.some((t) => t.startsWith("c: 400 ms mean latency") && t.includes("hatched")));
  assert.ok(titles.some((t) => t.includes("no data")));
  assert.equal(container.querySelectorAll('rect[fill^="url(#heat-hatch"]').length, 1);
  assert.ok(screen.getByRole("list", { hidden: true, name: "per-key values" }).textContent?.includes("c: 400 ms"));
  assert.ok(screen.getByText(/hatched keys/));

  fireEvent.click(screen.getByRole("button", { name: "errors" }));
  const errTitles = Array.from(container.querySelectorAll("svg title")).map((t) => t.textContent ?? "");
  assert.ok(errTitles.some((t) => t.startsWith("b: 5% errors")));
  assert.ok(errTitles.some((t) => t.startsWith("c: 25% errors") && t.includes("hatched")));
});

test("history heat-map stepper buttons have accessible names", async () => {
  const session = (id: number) => ({
    id,
    startedAt: 1_700_000_000_000 + id * 1000,
    endedAt: 1_700_000_000_000 + id * 1000 + 60_000,
    context: "prose",
    layoutFingerprint: "x",
    wpm: 40,
    accurateWpm: 38,
    errorRate: 0.02,
    targetWords: 30,
    targetSeconds: 60,
    keyStats: [],
  });
  // The trend chart measures its container; jsdom has no ResizeObserver.
  const g = globalThis as { ResizeObserver?: unknown };
  const hadRO = "ResizeObserver" in g;
  g.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  after(() => {
    if (!hadRO) delete g.ResizeObserver;
  });
  mockFetch({
    "GET /api/history": [session(1), session(2)],
    "GET /api/shortcut-drills": [],
  });
  render(<HistoryView keymap={null} />);
  await flush();
  const prev = screen.getByRole("button", { name: "previous session" }) as HTMLButtonElement;
  const next = screen.getByRole("button", { name: "next session" }) as HTMLButtonElement;
  assert.equal(prev.disabled, false);
  assert.equal(next.disabled, true);
  fireEvent.click(prev);
  assert.equal(prev.disabled, true);
  assert.equal(next.disabled, false);
});

function toRgb(c: string): number[] {
  if (c.startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [h, sat, l] = (c.match(/[\d.]+/g) ?? []).map(Number).map((v, i) => (i ? v / 100 : v));
  const a = sat * Math.min(l, 1 - l);
  const k = (n: number) => (n + h / 30) % 12;
  return [0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
}
function lum(c: number[]): number {
  const [r, g, bl] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
function ratio(a: number[], b2: number[]): number {
  const [x, y] = [lum(a), lum(b2)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("key label stays >= 4.5:1 on plain and hatched fills across the hot range", () => {
  const label = toRgb(LABEL_COLOR);
  const stripe = toRgb(HATCH_STRIPE);
  for (let t = HOT_THRESHOLD; t <= 1.0001; t += 0.05) {
    const fill = toRgb(hotColor(t));
    const under = fill.map((v, i) => v * (1 - HATCH_OPACITY) + stripe[i] * HATCH_OPACITY);
    assert.ok(ratio(label, fill) >= 4.5, `plain fill at ${t}`);
    assert.ok(ratio(label, under) >= 4.5, `under stripe at ${t}`);
  }
});
