import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeByContext } from "../src/shared/summary";
import type { SummaryEntry } from "../src/shared/summary";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // fixed clock for every windowing assertion

// daysAgo < 30 lands in the current window; 30..59 in the prior window.
function entry(context: string, daysAgo: number, wpm: number, errorRate = 0.05): SummaryEntry {
  return { context, startedAt: NOW - daysAgo * DAY, wpm, errorRate };
}

function close(actual: number, expected: number, msg?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, msg ?? `${actual} ≈ ${expected}`);
}

function find(summaries: ReturnType<typeof summarizeByContext>, context: string) {
  const s = summaries.find((x) => x.context === context);
  assert.ok(s, `expected a summary for ${context}`);
  return s!;
}

test("groups by context, in picker order, with correct counts and means", () => {
  const entries: SummaryEntry[] = [
    // intentionally out of picker order in the input array
    entry("teams", 1, 20),
    entry("prompts", 1, 40),
    entry("prompts", 1, 50),
    entry("cli", 1, 30),
  ];
  const out = summarizeByContext(entries, NOW);

  assert.deepEqual(
    out.map((s) => s.context),
    ["prompts", "cli", "teams"],
    "output follows CONTEXTS picker order, only contexts with data",
  );

  const prompts = find(out, "prompts");
  assert.equal(prompts.sessions, 2);
  close(prompts.meanWpm, 45);
  close(prompts.meanAccuracy, 0.95);

  assert.equal(find(out, "cli").sessions, 1);
  assert.equal(find(out, "teams").sessions, 1);
});

test("context values outside CONTEXTS are ignored", () => {
  const out = summarizeByContext([entry("bogus", 1, 99), entry("prompts", 1, 40)], NOW);
  assert.deepEqual(out.map((s) => s.context), ["prompts"]);
});

test("a clearly-faster current window yields a positive percentage", () => {
  const entries: SummaryEntry[] = [
    // prior window: three sessions at 40 wpm
    entry("prompts", 45, 40),
    entry("prompts", 50, 40),
    entry("prompts", 55, 40),
    // current window: three sessions at 60 wpm
    entry("prompts", 1, 60),
    entry("prompts", 2, 60),
    entry("prompts", 3, 60),
  ];
  const prompts = find(summarizeByContext(entries, NOW), "prompts");
  close(prompts.deltaPct!, 50); // (60-40)/40
  assert.equal(prompts.label, "50% faster");
});

test("a clearly-slower current window yields a slower label", () => {
  const entries: SummaryEntry[] = [
    entry("cli", 45, 50),
    entry("cli", 50, 50),
    entry("cli", 55, 50),
    entry("cli", 1, 40),
    entry("cli", 2, 40),
    entry("cli", 3, 40),
  ];
  const cli = find(summarizeByContext(entries, NOW), "cli");
  close(cli.deltaPct!, -20); // (40-50)/50
  assert.equal(cli.label, "20% slower");
});

test("a near-equal current window reads as flat", () => {
  const equal: SummaryEntry[] = [
    entry("prompts", 45, 50),
    entry("prompts", 50, 50),
    entry("prompts", 55, 50),
    entry("prompts", 1, 50),
    entry("prompts", 2, 50),
    entry("prompts", 3, 50),
  ];
  const flat = find(summarizeByContext(equal, NOW), "prompts");
  close(flat.deltaPct!, 0);
  assert.equal(flat.label, "flat");

  // A change inside the ±2% band is still flat.
  const tiny: SummaryEntry[] = [
    entry("prompts", 45, 50),
    entry("prompts", 50, 50),
    entry("prompts", 55, 50),
    entry("prompts", 1, 50.5),
    entry("prompts", 2, 50.5),
    entry("prompts", 3, 50.5),
  ];
  assert.equal(find(summarizeByContext(tiny, NOW), "prompts").label, "flat"); // 1% < 2%
});

test("fewer than SUMMARY_MIN_SESSIONS in either window flags not-enough-data", () => {
  // current has only 2 sessions; prior has 3
  const thinCurrent: SummaryEntry[] = [
    entry("prompts", 45, 40),
    entry("prompts", 50, 40),
    entry("prompts", 55, 40),
    entry("prompts", 1, 60),
    entry("prompts", 2, 60),
  ];
  const a = find(summarizeByContext(thinCurrent, NOW), "prompts");
  assert.equal(a.label, "not enough data yet");
  assert.equal(a.deltaPct, null);
  // still reports the all-time mean even without a trend
  close(a.meanWpm, (40 * 3 + 60 * 2) / 5);

  // prior has only 1 session; current has 3
  const thinPrior: SummaryEntry[] = [
    entry("cli", 45, 40),
    entry("cli", 1, 60),
    entry("cli", 2, 60),
    entry("cli", 3, 60),
  ];
  const b = find(summarizeByContext(thinPrior, NOW), "cli");
  assert.equal(b.label, "not enough data yet");
  assert.equal(b.deltaPct, null);

  // a context with a single all-time session
  const c = find(summarizeByContext([entry("teams", 1, 33)], NOW), "teams");
  assert.equal(c.sessions, 1);
  close(c.meanWpm, 33);
  assert.equal(c.label, "not enough data yet");
});

test("a zero prior baseline cannot produce a percentage", () => {
  const entries: SummaryEntry[] = [
    entry("code", 45, 0),
    entry("code", 50, 0),
    entry("code", 55, 0),
    entry("code", 1, 30),
    entry("code", 2, 30),
    entry("code", 3, 30),
  ];
  const code = find(summarizeByContext(entries, NOW), "code");
  assert.equal(code.deltaPct, null);
  assert.equal(code.label, "not enough data yet");
});

test("deterministic given an injected nowMs, and driven only by nowMs (no wall clock)", () => {
  const entries: SummaryEntry[] = [
    entry("prompts", 45, 40),
    entry("prompts", 50, 40),
    entry("prompts", 55, 40),
    entry("prompts", 1, 60),
    entry("prompts", 2, 60),
    entry("prompts", 3, 60),
  ];
  assert.deepEqual(summarizeByContext(entries, NOW), summarizeByContext(entries, NOW));

  // Advancing nowMs far past every session pushes them all out of both windows,
  // so the delta disappears — proving the windows track nowMs, not Date.now().
  const future = NOW + 365 * DAY;
  const shifted = find(summarizeByContext(entries, future), "prompts");
  assert.equal(shifted.label, "not enough data yet");
  assert.equal(shifted.deltaPct, null);
  close(shifted.meanWpm, 50); // headline mean is unaffected by the window
});

test("empty history yields an empty summary", () => {
  assert.deepEqual(summarizeByContext([], NOW), []);
});
