// UI tests for the PKT-12 shortcut drill: jsdom + Testing Library rendering the
// real <App />, with fetch mocked (no server) and setTimeout faked so the 400 ms
// feedback window is driven by the test.
import { mockFetch, type FetchCall } from "./helpers/dom";

import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../src/client/App";
import { HistoryView } from "../src/client/history/HistoryView";
import { FEEDBACK_MS } from "../src/client/drill/ShortcutDrill";
import {
  DRILL_CHORDS,
  buildDrillPrompts,
  chordLabel,
  summarizeAttempts,
  type DrillChord,
} from "../src/shared/chords";
import type { ShortcutDrillPayload, ShortcutDrillRow } from "../src/shared/types";

/** A fixed, valid prompt order (30 prompts, no immediate repeat). */
const PROMPTS: DrillChord[] = buildDrillPrompts(() => 0);

const BASE_ROUTES = {
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
  "GET /api/text": { mode: "random", targetedBigrams: [], lines: ["hello world"], text: "hello world" },
  "POST /api/shortcut-drills": (call: FetchCall) => ({
    id: 1,
    startedAt: (call.body as ShortcutDrillPayload).startedAt,
    endedAt: (call.body as ShortcutDrillPayload).endedAt,
    layoutFingerprint: "none",
    summary: summarizeAttempts([]),
  }),
};

const NON_DRILL_SHORTCUTS = ["cmd+s", "cmd+a", "cmd+c", "cmd+v", "cmd+x", "cmd+z", "ctrl+c", "ctrl+b"];

const KEY_NAMES: Record<string, string> = { backspace: "Backspace", delete: "Delete", escape: "Escape" };

/** A cancelable window keydown for a chord id such as `shift+cmd+c` or `backspace`. */
function keydown(chord: string, opts: { repeat?: boolean } = {}): KeyboardEvent {
  const parts = chord.split("+");
  const key = parts.pop()!;
  return new window.KeyboardEvent("keydown", {
    key: KEY_NAMES[key] ?? key,
    ctrlKey: parts.includes("ctrl"),
    altKey: parts.includes("alt"),
    shiftKey: parts.includes("shift"),
    metaKey: parts.includes("cmd"),
    repeat: opts.repeat ?? false,
    bubbles: true,
    cancelable: true,
  });
}

function press(chord: string, opts: { repeat?: boolean } = {}): KeyboardEvent {
  const e = keydown(chord, opts);
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

function endFeedback(): void {
  act(() => {
    mock.timers.tick(FEEDBACK_MS);
  });
}

/** Let pending fetch promises (and the state updates they trigger) settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setImmediate(r));
    });
  }
}

async function renderApp(): Promise<void> {
  render(<App buildShortcutPrompts={() => [...PROMPTS]} />);
  await flush();
}

function startDrill(): void {
  fireEvent.click(screen.getByRole("button", { name: "start shortcut drill" }));
}

const promptText = () => screen.getByTestId("drill-prompt").textContent;

let calls: FetchCall[];

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  calls = mockFetch(BASE_ROUTES);
  mock.timers.enable({ apis: ["setTimeout"] });
});

afterEach(() => {
  cleanup();
  mock.timers.reset();
});

test("fixed prompt order is a valid drill", () => {
  assert.equal(PROMPTS.length, 30);
  for (let i = 1; i < PROMPTS.length; i++) assert.notEqual(PROMPTS[i], PROMPTS[i - 1]);
});

test("UI path: start from Practice idle, answer 30 prompts, see results, save once", async () => {
  await renderApp();
  startDrill();

  // The first ⌘C prompt is answered with ⇧⌘C (a miss); everything else is right.
  const missAt = PROMPTS.indexOf("cmd+c");
  const answers = PROMPTS.map((p, i) => (i === missAt ? "shift+cmd+c" : p));

  for (let i = 0; i < PROMPTS.length; i++) {
    assert.equal(promptText(), chordLabel(PROMPTS[i]), `prompt ${i + 1}`);
    assert.equal(screen.getByTestId("drill-progress").textContent, `${i + 1} / 30`);
    press(answers[i]);
    const feedback = screen.getByTestId("drill-feedback").textContent;
    if (i === missAt) assert.equal(feedback, "✗ pressed ⇧⌘C, wanted ⌘C");
    else assert.equal(feedback, `✓ ${chordLabel(PROMPTS[i])}`);
    endFeedback();
  }
  await flush();

  const table = screen.getByTestId("shortcut-table");
  const rows = within(table).getAllByRole("row").slice(1);
  assert.equal(rows.length, DRILL_CHORDS.length);
  rows.forEach((row, i) => {
    const chord = DRILL_CHORDS[i];
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    assert.equal(cells[0], chordLabel(chord));
    assert.equal(cells[1], chord === "cmd+c" ? "2/3" : "3/3", `${chord} correct/attempts`);
  });
  assert.ok(screen.getByText("97%"), "overall accuracy 29/30");
  assert.ok(screen.getByText("saved to history"));

  const posts = calls.filter((c) => c.method === "POST" && c.url === "/api/shortcut-drills");
  assert.equal(posts.length, 1);
  const body = posts[0].body as ShortcutDrillPayload & { attempts: Record<string, unknown>[] };
  assert.match(body.clientId, /^[0-9a-f-]{36}$/);
  assert.ok(body.endedAt >= body.startedAt);
  assert.equal(body.attempts.length, 30);
  body.attempts.forEach((a, i) => {
    assert.equal(a.index, i);
    assert.equal(a.expected, PROMPTS[i]);
    assert.equal(a.actual, answers[i]);
    assert.ok(Number.isInteger(a.latencyMs) && (a.latencyMs as number) >= 0);
    assert.ok(!("correct" in a), "no client-sent correct field");
  });
});

test("keydowns during the feedback window are not attempts", async () => {
  await renderApp();
  startDrill();
  press(PROMPTS[0]);
  press(PROMPTS[1]); // during feedback: ignored
  endFeedback();
  assert.equal(promptText(), chordLabel(PROMPTS[1]));
  assert.equal(screen.getByTestId("drill-feedback").textContent, "");
  // A lone modifier and an auto-repeat are not attempts either.
  const lone = new window.KeyboardEvent("keydown", { key: "Meta", metaKey: true, bubbles: true, cancelable: true });
  act(() => {
    window.dispatchEvent(lone);
  });
  press(PROMPTS[1], { repeat: true });
  assert.equal(screen.getByTestId("drill-feedback").textContent, "");
});

test("preventDefault during a drill: every drilled chord, as an attempt and during feedback", async () => {
  await renderApp();
  startDrill();
  for (const chord of DRILL_CHORDS) {
    assert.equal(press(chord).defaultPrevented, true, `${chord} as an attempt`);
    assert.equal(press(chord).defaultPrevented, true, `${chord} during feedback`);
    assert.equal(press(chord, { repeat: true }).defaultPrevented, true, `${chord} auto-repeat`);
    endFeedback();
  }
  // A recorded non-drill chord is prevented too (it was taken as an attempt).
  assert.equal(press("x").defaultPrevented, true);
});

test("no preventDefault outside a drill: Practice idle view and a typing session", async () => {
  await renderApp();
  assert.ok(screen.getByRole("button", { name: "start shortcut drill" }));
  for (const chord of NON_DRILL_SHORTCUTS) {
    assert.equal(press(chord).defaultPrevented, false, `${chord} on idle view`);
  }

  fireEvent.click(screen.getByRole("button", { name: "start with random prompts" }));
  await flush();
  assert.ok(document.body.textContent?.includes("acc wpm"), "typing session is running");
  for (const chord of NON_DRILL_SHORTCUTS) {
    assert.equal(press(chord).defaultPrevented, false, `${chord} during typing`);
  }
});

test("Esc mid-drill returns to the idle view and saves nothing", async () => {
  await renderApp();
  startDrill();
  press(PROMPTS[0]);
  endFeedback();
  press(PROMPTS[1]);
  press("escape"); // during the feedback window
  assert.ok(screen.getByRole("button", { name: "start shortcut drill" }));
  assert.equal(screen.queryByTestId("drill-prompt"), null);

  endFeedback();
  await flush();
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  // The drill's listener is gone: drilled chords are no longer prevented.
  assert.equal(press("cmd+s").defaultPrevented, false);
});

test("leaving Practice mid-drill unmounts the drill and its listener", async () => {
  await renderApp();
  startDrill();
  mockFetch({ ...BASE_ROUTES, "GET /api/history": [], "GET /api/shortcut-drills": [] });
  fireEvent.click(screen.getByRole("button", { name: "history" }));
  await flush();
  assert.equal(screen.queryByTestId("drill-prompt"), null);
  assert.equal(press("cmd+s").defaultPrevented, false);
  fireEvent.click(screen.getByRole("button", { name: "practice" }));
  await flush();
  assert.ok(screen.getByRole("button", { name: "start shortcut drill" }));
});

function drillRow(id: number, startedAt: number, misses: DrillChord[]): ShortcutDrillRow {
  const attempts = PROMPTS.map((expected) => {
    const actual = misses.includes(expected) ? "x" : expected;
    return { expected, actual, latencyMs: 500, correct: actual === expected };
  });
  return { id, startedAt, endedAt: startedAt + 20_000, layoutFingerprint: "none", summary: summarizeAttempts(attempts) };
}

test("History shows shortcut drills even with no typing sessions; selecting one shows its table", async () => {
  const older = drillRow(1, Date.UTC(2026, 10, 1, 12), ["cmd+z"]); // ⌘Z 0/3
  const newer = drillRow(2, Date.UTC(2026, 10, 2, 12), []);
  mockFetch({ "GET /api/history": [], "GET /api/shortcut-drills": [older, newer] });

  render(<HistoryView keymap={null} />);
  await flush();

  assert.ok(screen.getByText(/No sessions yet/));
  const section = screen.getByRole("region", { name: "shortcut drills" });
  const items = within(section).getAllByRole("button");
  assert.equal(items.length, 2);
  // Newest first, each with date, accuracy and mean correct latency.
  assert.ok(items[0].textContent?.includes(new Date(newer.startedAt).toLocaleString()));
  assert.ok(items[0].textContent?.includes("100%"));
  assert.ok(items[1].textContent?.includes(new Date(older.startedAt).toLocaleString()));
  assert.ok(items[1].textContent?.includes("90%"));
  assert.ok(items[1].textContent?.includes("500 ms"));
  assert.equal(screen.queryByTestId("shortcut-table"), null);

  fireEvent.click(items[1]);
  const rows = within(screen.getByTestId("shortcut-table")).getAllByRole("row").slice(1);
  assert.equal(rows.length, DRILL_CHORDS.length);
  rows.forEach((row, i) => {
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    const chord = DRILL_CHORDS[i];
    assert.equal(cells[0], chordLabel(chord));
    assert.equal(cells[1], chord === "cmd+z" ? "0/3" : "3/3");
    assert.equal(cells[3], chord === "cmd+z" ? "—" : "500 ms");
  });
});
