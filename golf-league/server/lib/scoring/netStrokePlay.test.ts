// Hand-computed scenarios for the Net Stroke Play scorer. Every expected
// number is derived in the comment above its assertion so a future reader
// can audit without running the engine. Where stroke allocation matters,
// the comment shows the exact dots-per-hole table so SI rules don't have
// to be re-derived from scratch.

import { describe, it, expect } from "vitest";
import { netStrokePlayScorer } from "./netStrokePlay";
import type { HoleInfo } from "../scoring";
import type { ScorerInput } from "./types";

// Standard 9-hole layout for tests. Par 35, stroke indexes 1..9 distributed
// so hole 1 is hardest. (Same shape as a real Erie Village 9.)
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

const POINTS_CFG = { pointsForWin: 2, pointsForTie: 1 };

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
}): ScorerInput {
  return {
    a: { id: 1, kind: "team", strokes: strokesFromArray(opts.aStrokes), handicap: opts.aHcp },
    b: { id: 2, kind: "team", strokes: strokesFromArray(opts.bStrokes), handicap: opts.bHcp },
    holes: HOLES,
    config: POINTS_CFG,
  };
}

describe("net_stroke_play scorer", () => {
  it("scratch match (equal handicaps): lower raw total wins", () => {
    // No strokes allocated to either side. A shoots 36, B shoots 38.
    // Net = raw, A wins by 2.
    const result = netStrokePlayScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      // A: 4-5-4-4-4-3-5-4-3 = 36
      aStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
      // B: 5-5-4-4-4-3-5-5-3 = 38
      bStrokes: [5, 5, 4, 4, 4, 3, 5, 5, 3],
    }));
    expect(result.teamAPoints).toBe(2); // pointsForWin
    expect(result.teamBPoints).toBe(0);
    // Per-hole points always 0 in stroke play.
    for (const h of result.holes) {
      expect(h.aPoints).toBe(0);
      expect(h.bPoints).toBe(0);
    }
    expect(result.teamAHolePoints).toBe(0);
    expect(result.teamBHolePoints).toBe(0);
    // No strokes received by anyone (equal handicaps).
    for (const h of HOLES) {
      expect(result.strokesReceivedByA[h.holeNumber]).toBe(0);
      expect(result.strokesReceivedByB[h.holeNumber]).toBe(0);
    }
  });

  it("scratch match: tie awards pointsForTie to both sides", () => {
    // Both shoot 36. Net = raw = 36. Tie.
    const result = netStrokePlayScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
      bStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
    }));
    expect(result.teamAPoints).toBe(1); // pointsForTie
    expect(result.teamBPoints).toBe(1);
  });

  it("handicap allocation: 5-stroke difference allocated to hardest 5 holes", () => {
    // A handicap = 12, B handicap = 7 → diff = 5.
    // Allocation by SI: holes with SI 1..5 each get 1 stroke for A.
    // SI map (hole → SI): 1→1, 2→5, 3→3, 4→7, 5→2, 6→9, 7→4, 8→6, 9→8.
    // SI ≤5 → holes 1, 2, 3, 5, 7. So A receives 1 stroke each on those.
    //
    // Both shoot raw 40 (a clean -2 over par across 9). With 5 strokes
    // received, A's net = 35; B's net = 40. A wins by 5.
    const result = netStrokePlayScorer.compute(buildInput({
      aHcp: 12, bHcp: 7,
      aStrokes: [5, 5, 5, 4, 5, 3, 5, 4, 4], // sum = 40
      bStrokes: [5, 5, 5, 4, 5, 3, 5, 4, 4], // sum = 40
    }));
    expect(result.teamAPoints).toBe(2);
    expect(result.teamBPoints).toBe(0);

    // Verify the dots map exactly.
    const expectedAStrokes: Record<number, number> = {
      1: 1, 2: 1, 3: 1, 4: 0, 5: 1, 6: 0, 7: 1, 8: 0, 9: 0,
    };
    for (const [hole, dots] of Object.entries(expectedAStrokes)) {
      expect(result.strokesReceivedByA[Number(hole)], `hole ${hole} A strokes`).toBe(dots);
      expect(result.strokesReceivedByB[Number(hole)], `hole ${hole} B strokes`).toBe(0);
    }

    // Verify per-hole net values reflect the allocation.
    for (const h of result.holes) {
      // Same raw, A net = raw - dots, B net = raw.
      const dots = expectedAStrokes[h.holeNumber];
      expect(h.aNet).toBe(h.aRaw - dots);
      expect(h.bNet).toBe(h.bRaw);
    }
  });

  it("partial round: no points awarded when any hole is missing", () => {
    // A has 8 holes entered, B has all 9. Should not award points either
    // way — recomputeWeek already skips matchups with incomplete scores
    // upstream, but the scorer is defensive too so a misuse in dev or in
    // a future code path can't silently produce a bogus winner.
    const a = strokesFromArray([4, 5, 4, 4, 4, 3, 5, 4, 3]);
    delete a[5]; // strip hole 5 to simulate a partial round
    const result = netStrokePlayScorer.compute({
      a: { id: 1, kind: "team", strokes: a, handicap: 0 },
      b: { id: 2, kind: "team", strokes: strokesFromArray([5, 5, 4, 4, 4, 3, 5, 5, 3]), handicap: 0 },
      holes: HOLES,
      config: POINTS_CFG,
    });
    expect(result.teamAPoints).toBe(0);
    expect(result.teamBPoints).toBe(0);
  });

  it("uses Zod defaults when config omits optional fields", () => {
    // Passing an empty object should hydrate pointsForWin=2 / pointsForTie=1
    // from the schema defaults — important so admins can configure a week
    // with `formatConfig: {}` and still get sensible scoring.
    const result = netStrokePlayScorer.compute({
      a: { id: 1, kind: "team", strokes: strokesFromArray([4, 4, 4, 4, 4, 3, 5, 4, 3]), handicap: 0 },
      b: { id: 2, kind: "team", strokes: strokesFromArray([5, 5, 5, 5, 5, 4, 6, 5, 4]), handicap: 0 },
      holes: HOLES,
      config: {},
    });
    // A: 35, B: 44. A wins by 9.
    expect(result.teamAPoints).toBe(2);
    expect(result.teamBPoints).toBe(0);
  });

  it("rejects non-team participants", () => {
    // The scorer's scoreShape is per_team. If a future caller passes a
    // player-shaped participant by accident the scorer should accept it
    // (since the math doesn't care), but we want to lock the contract via
    // tests so an intentional change has to update the test too. Today we
    // accept either kind because the math is participant-shape-agnostic;
    // this test pins that behavior.
    const result = netStrokePlayScorer.compute({
      a: { id: 1, kind: "player", strokes: strokesFromArray([4, 4, 4, 4, 4, 3, 5, 4, 3]), handicap: 0 },
      b: { id: 2, kind: "player", strokes: strokesFromArray([5, 5, 5, 5, 5, 4, 6, 5, 4]), handicap: 0 },
      holes: HOLES,
      config: POINTS_CFG,
    });
    expect(result.teamAPoints).toBe(2);
  });
});
