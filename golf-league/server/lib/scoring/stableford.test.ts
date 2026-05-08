// Hand-computed scenarios for the Stableford scorer. Every expected number
// is derived in the comment above its assertion so a future reader can
// audit without running the engine. Where stroke allocation matters, the
// comment shows the exact dots-per-hole table.

import { describe, it, expect } from "vitest";
import { stablefordScorer, stablefordPointsForDelta } from "./stableford";
import type { HoleInfo } from "../scoring";
import type { ScorerInput } from "./types";

// Standard 9-hole layout for tests. Par 35, stroke indexes 1..9 distributed
// so hole 1 is hardest (same shape as the netStrokePlay test fixture).
const HOLES: HoleInfo[] = [
  { holeNumber: 1, par: 4, strokeIndex: 1 },
  { holeNumber: 2, par: 5, strokeIndex: 5 },
  { holeNumber: 3, par: 4, strokeIndex: 3 },
  { holeNumber: 4, par: 4, strokeIndex: 7 },
  { holeNumber: 5, par: 4, strokeIndex: 2 },
  { holeNumber: 6, par: 3, strokeIndex: 9 },
  { holeNumber: 7, par: 5, strokeIndex: 4 },
  { holeNumber: 8, par: 4, strokeIndex: 6 },
  { holeNumber: 9, par: 3, strokeIndex: 8 },
];
// Pars: [4, 5, 4, 4, 4, 3, 5, 4, 3] = 36 ... wait, 4+5+4+4+4+3+5+4+3 = 36
// Recompute: 4+5=9 +4=13 +4=17 +4=21 +3=24 +5=29 +4=33 +3=36. Par 36.

const DEFAULT_CFG = {}; // exercise Zod defaults — eagle=5/birdie=3/par=2/bogey=1/double=0, win=2/tie=1.

function strokesFromArray(arr: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (let i = 0; i < arr.length; i++) out[i + 1] = arr[i];
  return out;
}

function buildInput(opts: {
  aHcp: number;
  bHcp: number;
  aStrokes: number[];
  bStrokes: number[];
  config?: unknown;
}): ScorerInput {
  return {
    a: { id: 1, kind: "team", strokes: strokesFromArray(opts.aStrokes), handicap: opts.aHcp },
    b: { id: 2, kind: "team", strokes: strokesFromArray(opts.bStrokes), handicap: opts.bHcp },
    holes: HOLES,
    config: opts.config ?? DEFAULT_CFG,
  };
}

describe("stablefordPointsForDelta — points table lookup", () => {
  const table = { eagle: 5, birdie: 3, par: 2, bogey: 1, double: 0 };
  it("eagle (-2 from par) → 5", () => {
    expect(stablefordPointsForDelta(-2, table)).toBe(5);
  });
  it("albatross (-3) collapses to eagle value", () => {
    expect(stablefordPointsForDelta(-3, table)).toBe(5);
  });
  it("birdie (-1) → 3", () => {
    expect(stablefordPointsForDelta(-1, table)).toBe(3);
  });
  it("par (0) → 2", () => {
    expect(stablefordPointsForDelta(0, table)).toBe(2);
  });
  it("bogey (+1) → 1", () => {
    expect(stablefordPointsForDelta(1, table)).toBe(1);
  });
  it("double (+2) → 0", () => {
    expect(stablefordPointsForDelta(2, table)).toBe(0);
  });
  it("triple bogey (+3) collapses to double value", () => {
    expect(stablefordPointsForDelta(3, table)).toBe(0);
  });
});

describe("stableford scorer", () => {
  it("scratch match, A all birdies vs B all pars → A wins on totals", () => {
    // Pars: 4, 5, 4, 4, 4, 3, 5, 4, 3
    // A scores all -1: 3, 4, 3, 3, 3, 2, 4, 3, 2 → 9 birdies × 3 = 27
    // B scores all par: 4, 5, 4, 4, 4, 3, 5, 4, 3 → 9 pars × 2 = 18
    const result = stablefordScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: [3, 4, 3, 3, 3, 2, 4, 3, 2],
      bStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
    }));
    expect(result.teamAHolePoints).toBe(27);
    expect(result.teamBHolePoints).toBe(18);
    expect(result.teamAPoints).toBe(2); // pointsForWin
    expect(result.teamBPoints).toBe(0);
    // Per-hole points carry through.
    for (const h of result.holes) {
      expect(h.aPoints).toBe(3); // birdie
      expect(h.bPoints).toBe(2); // par
    }
  });

  it("tie on Stableford totals → both get pointsForTie", () => {
    // Both shoot all pars → both 18 each.
    const stroke = [4, 5, 4, 4, 4, 3, 5, 4, 3];
    const result = stablefordScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: stroke,
      bStrokes: [...stroke],
    }));
    expect(result.teamAHolePoints).toBe(18);
    expect(result.teamBHolePoints).toBe(18);
    expect(result.teamAPoints).toBe(1); // pointsForTie
    expect(result.teamBPoints).toBe(1);
  });

  it("eagle, birdie, par, bogey, double, triple — full point ladder per hole", () => {
    // Hand-crafted A round to hit every cell of the points table.
    // Pars by hole: [4, 5, 4, 4, 4, 3, 5, 4, 3]
    // Hole 1 par 4 → A 2 (eagle, -2): 5 pts
    // Hole 2 par 5 → A 3 (eagle, -2): 5 pts
    // Hole 3 par 4 → A 3 (birdie, -1): 3 pts
    // Hole 4 par 4 → A 4 (par, 0): 2 pts
    // Hole 5 par 4 → A 5 (bogey, +1): 1 pt
    // Hole 6 par 3 → A 5 (double, +2): 0 pts
    // Hole 7 par 5 → A 8 (triple, +3 → collapses to double): 0 pts
    // Hole 8 par 4 → A 4 (par, 0): 2 pts
    // Hole 9 par 3 → A 2 (birdie, -1): 3 pts
    // Total A: 5+5+3+2+1+0+0+2+3 = 21
    const result = stablefordScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: [2, 3, 3, 4, 5, 5, 8, 4, 2],
      bStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3], // all pars → 18
    }));
    expect(result.teamAHolePoints).toBe(21);
    expect(result.teamBHolePoints).toBe(18);
    // Verify per-hole values one by one.
    const expected = [5, 5, 3, 2, 1, 0, 0, 2, 3];
    for (let i = 0; i < 9; i++) {
      expect(result.holes[i].aPoints, `hole ${i + 1} A points`).toBe(expected[i]);
    }
  });

  it("handicap allocation: 5 dots convert pars to net birdies on hardest 5 holes", () => {
    // A handicap = 12, B handicap = 7 → diff = 5.
    // Allocation by SI ≤ 5 → holes 1, 2, 3, 5, 7 each get 1 stroke for A.
    // (Same SI map verified in netStrokePlay.test.ts.)
    //
    // Both shoot raw all-pars (36).
    // A's NET on holes with dots = par - 1 = net birdie on those 5 holes.
    // A's NET on the other 4 holes = par.
    // → A: 5 birdies × 3 + 4 pars × 2 = 15 + 8 = 23
    // → B: 9 pars × 2 = 18
    const stroke = [4, 5, 4, 4, 4, 3, 5, 4, 3]; // all pars
    const result = stablefordScorer.compute(buildInput({
      aHcp: 12, bHcp: 7,
      aStrokes: stroke,
      bStrokes: [...stroke],
    }));
    expect(result.teamAHolePoints).toBe(23);
    expect(result.teamBHolePoints).toBe(18);
    expect(result.teamAPoints).toBe(2);
    expect(result.teamBPoints).toBe(0);

    // Verify dots map matches the NSP test (allocation rule is shared).
    const expectedDots: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 0, 5: 1, 6: 0, 7: 1, 8: 0, 9: 0 };
    for (const [hole, dots] of Object.entries(expectedDots)) {
      expect(result.strokesReceivedByA[Number(hole)], `hole ${hole} A strokes`).toBe(dots);
    }
  });

  it("custom points table — admin can rebalance the ladder", () => {
    // International / "true" Stableford with eagle worth more than the
    // brief's modified default. Eagle 8, birdie 4, par 0, bogey -2, double -4.
    const customCfg = {
      pointsTable: { eagle: 8, birdie: 4, par: 0, bogey: -2, double: -4 },
      pointsForWin: 2,
      pointsForTie: 1,
    };
    // A: 9 pars → 0. B: 9 birdies → 36.
    const result = stablefordScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3], // all pars
      bStrokes: [3, 4, 3, 3, 3, 2, 4, 3, 2], // all birdies
      config: customCfg,
    }));
    expect(result.teamAHolePoints).toBe(0);
    expect(result.teamBHolePoints).toBe(36);
    expect(result.teamAPoints).toBe(0);
    expect(result.teamBPoints).toBe(2); // pointsForWin
  });

  it("partial round: 0 match points, partial Stableford totals", () => {
    // A has 8 holes entered (missing hole 5), B has all 9.
    // The match outcome should be 0/0 (consistent with NSP and the
    // skip-on-incomplete behavior in storage.recomputeWeek), even though
    // the partial Stableford totals are non-zero.
    const a = strokesFromArray([3, 4, 3, 3, 3, 2, 4, 3, 2]); // all birdies = 27 if complete
    delete a[5];
    const result = stablefordScorer.compute({
      a: { id: 1, kind: "team", strokes: a, handicap: 0 },
      b: { id: 2, kind: "team", strokes: strokesFromArray([4, 5, 4, 4, 4, 3, 5, 4, 3]), handicap: 0 },
      holes: HOLES,
      config: DEFAULT_CFG,
    });
    expect(result.teamAPoints).toBe(0);
    expect(result.teamBPoints).toBe(0);
    // Hole 5 emitted with zeros so the consumer always sees 9 entries.
    expect(result.holes.length).toBe(9);
    expect(result.holes[4].aPoints).toBe(0);
    expect(result.holes[4].bPoints).toBe(0);
  });

  it("uses Zod defaults when config omits optional fields", () => {
    // Empty config object should fully hydrate the points table + win/tie.
    // Same scenario as the "all birdies vs all pars" test, just with {} config.
    const result = stablefordScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: [3, 4, 3, 3, 3, 2, 4, 3, 2],
      bStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
      config: {},
    }));
    expect(result.teamAHolePoints).toBe(27);
    expect(result.teamBHolePoints).toBe(18);
    expect(result.teamAPoints).toBe(2);
  });
});
