import type { KeystrokeRecord } from "../../shared/types";

export type CharStatus = "untyped" | "correct" | "wrong";

// Pure capture logic behind the typing surface — no DOM, no I/O, fully testable
// with an injected clock. The React hook (useKeystrokeCapture) only wires DOM
// keydown events to this buffer; all the rules live here.
//
// Monkeytype-style: typing a wrong character still advances the cursor and the
// wrong attempt stays in `records` (so it counts as an error forever). Backspace
// only moves the cursor back; retyping appends a fresh record at that index.
export class KeystrokeBuffer {
  readonly records: KeystrokeRecord[] = [];
  cursor = 0;
  private lastTime: number | null = null;

  constructor(
    readonly expected: string,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  type(char: string): void {
    const now = this.clock();
    const latencyMs = this.lastTime === null ? 0 : now - this.lastTime;
    this.lastTime = now;
    const expectedChar = this.expected[this.cursor] ?? "";
    this.records.push({
      index: this.cursor,
      expectedChar,
      actualChar: char,
      latencyMs,
      correct: char === expectedChar,
    });
    this.cursor++;
  }

  backspace(): void {
    if (this.cursor > 0) this.cursor--;
  }

  get done(): boolean {
    return this.cursor >= this.expected.length;
  }

  statusAt(i: number): CharStatus {
    if (i >= this.cursor) return "untyped";
    for (let r = this.records.length - 1; r >= 0; r--) {
      if (this.records[r].index === i) return this.records[r].correct ? "correct" : "wrong";
    }
    return "untyped";
  }
}
