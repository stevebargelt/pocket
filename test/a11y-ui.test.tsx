// jsdom tests for the accessibility pass (#21): ARIA state, heading, and a heat
// map that carries its values without colour.
import { mockFetch } from "./helpers/dom";

import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/client/App";
import { HistoryView } from "../src/client/history/HistoryView";
import { HeatMap } from "../src/client/components/HeatMap";
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
  assert.equal(container.querySelectorAll('rect[fill="url(#heat-hatch)"]').length, 1);
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
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
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
});
