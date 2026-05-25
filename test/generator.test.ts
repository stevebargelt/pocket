import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/server/db";
import { seedCorpus } from "../src/server/corpus";
import { generateText } from "../src/server/generator";
import { containsBigram } from "../src/shared/bigrams";
import { LAYOUT_FINGERPRINT } from "../src/shared/constants";

function insertBigram(db: ReturnType<typeof openDb>, bigram: string, speed: number, samples: number) {
  db.prepare(
    "INSERT INTO bigram_stats (bigram, layout_fingerprint, speed_ema, error_rate_ema, samples, last_updated) VALUES (?,?,?,0,?,0)",
  ).run(bigram, LAYOUT_FINGERPRINT, speed, samples);
}

test("targeted mode prefers corpus lines containing the worst bigrams", () => {
  const db = openDb(":memory:");
  seedCorpus(db);
  // 'th' is the slowest and well above the bigram samples gate (15).
  insertBigram(db, "th", 400, 40);
  insertBigram(db, "an", 90, 40);
  insertBigram(db, "in", 95, 40);

  const out = generateText(db, "targeted", 5, LAYOUT_FINGERPRINT);
  assert.equal(out.mode, "targeted");
  // Targeted bigrams are the eligible set, ranked by weakness (slowest first).
  assert.deepEqual(out.targetedBigrams, ["th", "in", "an"]);
  assert.ok(out.lines.length > 0);
  // Every selected line contains at least one of the weak bigrams.
  for (const line of out.lines) {
    assert.ok(
      out.targetedBigrams.some((b) => containsBigram(line, b)),
      `line should contain a weak bigram: "${line}"`,
    );
  }
  // The weakest ('th') drove selection: at least one line contains it.
  assert.ok(out.lines.some((l) => containsBigram(l, "th")));
  db.close();
});

test("below the samples gate, targeted falls back to a random sample", () => {
  const db = openDb(":memory:");
  seedCorpus(db);
  insertBigram(db, "th", 400, 5); // below MIN_BIGRAM_SAMPLES (15)
  const out = generateText(db, "targeted", 5, LAYOUT_FINGERPRINT);
  assert.equal(out.mode, "random");
  assert.ok(out.lines.length > 0);
  assert.ok(out.text.length > 0);
});

test("untargeted mode returns a non-empty random sample", () => {
  const db = openDb(":memory:");
  seedCorpus(db);
  const out = generateText(db, "random", 5, LAYOUT_FINGERPRINT);
  assert.equal(out.mode, "random");
  assert.ok(out.lines.length > 0);
  assert.ok(out.text.length > 0);
  db.close();
});

test("never returns empty when the corpus is non-empty", () => {
  const db = openDb(":memory:");
  seedCorpus(db);
  for (const mode of ["targeted", "random"] as const) {
    const out = generateText(db, mode, 5, LAYOUT_FINGERPRINT);
    assert.ok(out.text.length > 0, `${mode} should not be empty`);
  }
  db.close();
});
