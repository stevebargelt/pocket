// Static physical geometry for the MoErgo Glove 80, used by KeymapView to place
// the 80 parsed key bindings on a hand-rolled SVG. This replaces the hardcoded
// QWERTY ROWS table in HeatMap.tsx (backlog #5) for the live keymap render.
//
// The index of each entry (0..79) matches the parser's flat `bindings` array,
// which in turn matches the factory keymap's `POS_*` defines:
//   row 1 .... LH C6..C2 | RH C2..C6                 (5 per hand, no inner column)
//   rows 2-5 . LH C6..C1 | RH C1..C6                 (6 per hand)
//   row 6 .... LH C6..C2 | RH C2..C6                 (5 per hand, no inner column)
//   thumbs ... LH T1..T3 / RH T3..T1 (upper/back row, idx 52-57)
//              LH T4..T6 / RH T6..T4 (lower/front row, idx 69-74)
// Geometry is computed once at module load (deterministic) so the export reads
// like a static table.

export const KEY_W = 46;
export const KEY_H = 46;

const GAP = 6;
const COL = KEY_W + GAP; // horizontal step between columns
const ROW = KEY_H + GAP; // vertical step between rows
const MARGIN = 16;
const CENTER_GAP = 72; // empty space between the two split halves

// Per-finger columnar stagger (downward offset in key-units). The middle-finger
// column (C3) sits highest; the inner (C1) and outer (C6) columns drop down,
// producing the Glove 80's recognisable curved column profile.
const COLUMN_STAGGER: Record<number, number> = {
  1: 0.5,
  2: 0.2,
  3: 0.0,
  4: 0.1,
  5: 0.4,
  6: 0.55,
};

const RIGHT_BASE = MARGIN + 6 * COL + CENTER_GAP;
const CENTER_X = (MARGIN + (RIGHT_BASE + 5 * COL + KEY_W)) / 2;

// Thumb cluster: two rows of three keys per hand, set below the matrix and tucked
// under the inner columns so it reads as a distinct, prominent cluster.
const THUMB_X_OFFSET = 2.7; // in COL units, from the left margin (LH lower-left key)
const THUMB_UPPER_Y = MARGIN + 6.8 * ROW;
const THUMB_LOWER_Y = MARGIN + 7.8 * ROW;

export const BOARD_WIDTH = RIGHT_BASE + 5 * COL + KEY_W + MARGIN;
export const BOARD_HEIGHT = THUMB_LOWER_Y + KEY_H + MARGIN;

type Hand = "L" | "R";

export interface KeyGeom {
  /** Top-left x of the key cell. */
  x: number;
  /** Top-left y of the key cell. */
  y: number;
  w: number;
  h: number;
  /** True for the 12 thumb-cluster keys (indices 52-57, 69-74). */
  thumb: boolean;
  hand: Hand;
  /** Human-readable physical position, e.g. "LH_C3R2" or "RH_T1". */
  pos: string;
}

type PosDesc =
  | { hand: Hand; col: number; row: number }
  | { hand: Hand; thumb: number };

// The 80 physical positions in parser-binding order (mirrors the POS_* defines).
const POSITIONS: PosDesc[] = [
  // row 1 — LH C6..C2, RH C2..C6
  { hand: "L", col: 6, row: 1 }, { hand: "L", col: 5, row: 1 }, { hand: "L", col: 4, row: 1 },
  { hand: "L", col: 3, row: 1 }, { hand: "L", col: 2, row: 1 },
  { hand: "R", col: 2, row: 1 }, { hand: "R", col: 3, row: 1 }, { hand: "R", col: 4, row: 1 },
  { hand: "R", col: 5, row: 1 }, { hand: "R", col: 6, row: 1 },
  // row 2 — LH C6..C1, RH C1..C6
  { hand: "L", col: 6, row: 2 }, { hand: "L", col: 5, row: 2 }, { hand: "L", col: 4, row: 2 },
  { hand: "L", col: 3, row: 2 }, { hand: "L", col: 2, row: 2 }, { hand: "L", col: 1, row: 2 },
  { hand: "R", col: 1, row: 2 }, { hand: "R", col: 2, row: 2 }, { hand: "R", col: 3, row: 2 },
  { hand: "R", col: 4, row: 2 }, { hand: "R", col: 5, row: 2 }, { hand: "R", col: 6, row: 2 },
  // row 3
  { hand: "L", col: 6, row: 3 }, { hand: "L", col: 5, row: 3 }, { hand: "L", col: 4, row: 3 },
  { hand: "L", col: 3, row: 3 }, { hand: "L", col: 2, row: 3 }, { hand: "L", col: 1, row: 3 },
  { hand: "R", col: 1, row: 3 }, { hand: "R", col: 2, row: 3 }, { hand: "R", col: 3, row: 3 },
  { hand: "R", col: 4, row: 3 }, { hand: "R", col: 5, row: 3 }, { hand: "R", col: 6, row: 3 },
  // row 4
  { hand: "L", col: 6, row: 4 }, { hand: "L", col: 5, row: 4 }, { hand: "L", col: 4, row: 4 },
  { hand: "L", col: 3, row: 4 }, { hand: "L", col: 2, row: 4 }, { hand: "L", col: 1, row: 4 },
  { hand: "R", col: 1, row: 4 }, { hand: "R", col: 2, row: 4 }, { hand: "R", col: 3, row: 4 },
  { hand: "R", col: 4, row: 4 }, { hand: "R", col: 5, row: 4 }, { hand: "R", col: 6, row: 4 },
  // row 5 — LH C6..C1
  { hand: "L", col: 6, row: 5 }, { hand: "L", col: 5, row: 5 }, { hand: "L", col: 4, row: 5 },
  { hand: "L", col: 3, row: 5 }, { hand: "L", col: 2, row: 5 }, { hand: "L", col: 1, row: 5 },
  // upper/back thumb row — LH T1..T3, RH T3..T1
  { hand: "L", thumb: 1 }, { hand: "L", thumb: 2 }, { hand: "L", thumb: 3 },
  { hand: "R", thumb: 3 }, { hand: "R", thumb: 2 }, { hand: "R", thumb: 1 },
  // row 5 — RH C1..C6
  { hand: "R", col: 1, row: 5 }, { hand: "R", col: 2, row: 5 }, { hand: "R", col: 3, row: 5 },
  { hand: "R", col: 4, row: 5 }, { hand: "R", col: 5, row: 5 }, { hand: "R", col: 6, row: 5 },
  // row 6 — LH C6..C2
  { hand: "L", col: 6, row: 6 }, { hand: "L", col: 5, row: 6 }, { hand: "L", col: 4, row: 6 },
  { hand: "L", col: 3, row: 6 }, { hand: "L", col: 2, row: 6 },
  // lower/front thumb row — LH T4..T6, RH T6..T4
  { hand: "L", thumb: 4 }, { hand: "L", thumb: 5 }, { hand: "L", thumb: 6 },
  { hand: "R", thumb: 6 }, { hand: "R", thumb: 5 }, { hand: "R", thumb: 4 },
  // row 6 — RH C2..C6
  { hand: "R", col: 2, row: 6 }, { hand: "R", col: 3, row: 6 }, { hand: "R", col: 4, row: 6 },
  { hand: "R", col: 5, row: 6 }, { hand: "R", col: 6, row: 6 },
];

function mainXY(hand: Hand, col: number, row: number): { x: number; y: number } {
  const visualX = hand === "L" ? 6 - col : col - 1;
  const base = hand === "L" ? MARGIN : RIGHT_BASE;
  return {
    x: base + visualX * COL,
    y: MARGIN + (row - 1 + COLUMN_STAGGER[col]) * ROW,
  };
}

function thumbXY(hand: Hand, thumb: number): { x: number; y: number } {
  const upper = thumb <= 3;
  const i = upper ? thumb - 1 : thumb - 4; // 0..2, left→right for the left hand
  const leftX = MARGIN + (THUMB_X_OFFSET + i) * COL;
  const y = upper ? THUMB_UPPER_Y : THUMB_LOWER_Y;
  if (hand === "L") return { x: leftX, y };
  // Mirror the left-hand position across the board centre for a symmetric cluster.
  return { x: 2 * CENTER_X - (leftX + KEY_W), y };
}

function buildLayout(): KeyGeom[] {
  return POSITIONS.map((p) => {
    if ("thumb" in p) {
      const { x, y } = thumbXY(p.hand, p.thumb);
      return { x, y, w: KEY_W, h: KEY_H, thumb: true, hand: p.hand, pos: `${p.hand}H_T${p.thumb}` };
    }
    const { x, y } = mainXY(p.hand, p.col, p.row);
    return { x, y, w: KEY_W, h: KEY_H, thumb: false, hand: p.hand, pos: `${p.hand}H_C${p.col}R${p.row}` };
  });
}

/** Static index(0-79) → geometry table for the Glove 80, in parser-binding order. */
export const KEY_LAYOUT: readonly KeyGeom[] = buildLayout();
