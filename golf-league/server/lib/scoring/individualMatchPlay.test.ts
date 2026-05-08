// Hand-computed scenarios for the Individual Match Play scorer. Math is
// identical to team_match_play (which is parity-tested against 15 prod
// matchups in parity.test.ts), so these tests focus on:
//   1. Shape contract (rejects team participants)
//   2. The per-hole win / tie / loss math + match-win bonus
//   3. Stroke allocation when handicaps differ
//   4. Zod default hydration so admins can pass formatConfig: {}
//
// We don't re-prove the legacy engine here — that would duplicate the
// parity test's coverage. We're proving the WRAPPER + shape assertions.

import { describe, it, expect } from "vitest";
import { individualMatchPlayScorer } from "./individualMatchPlay";
import type { HoleInfo } from "../scoring";
import type { ScorerInput } from "./types";

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

const POINTS_CFG = { pointsPerHoleWin: 2, pointsPerHoleTie: 1, pointsForMatchWin: 2 };

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
  /** Override the participant kind for shape-contract tests. */
  aKind?: "team" | "player";
  bKind?: "team" | "player";
}): ScorerInput {
  return {
    a: { id: 11, kind: opts.aKind ?? "player", strokes: strokesFromArray(opts.aStrokes), handicap: opts.aHcp },
    b: { id: 22, kind: opts.bKind ?? "player", strokes: strokesFromArray(opts.bStrokes), handicap: opts.bHcp },
    holes: HOLES,
    config: opts.config ?? POINTS_CFG,
  };
}

describe("individual_match_play scorer", () => {
  it("rejects team participants on side A (per_player shape contract)", () => {
    expect(() =>
      individualMatchPlayScorer.compute(buildInput({
        aHcp: 0, bHcp: 0,
        aStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
        bStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
        aKind: "team",
      })),
    ).toThrow(/requires both sides to be players/);
  });

  it("rejects team participants on side B", () => {
    expect(() =>
      individualMatchPlayScorer.compute(buildInput({
        aHcp: 0, bHcp: 0,
        aStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
        bStrokes: [4, 5, 4, 4, 4, 3, 5, 4, 3],
        bKind: "team",
      })),
    ).toThrow(/requires both sides to be players/);
  });

  it("scratch match: A wins 5 holes, B wins 2, ties 2 → A 14, B 6", () => {
    // Scratch (no dots). Hand-built per-hole result table.
    //
    // hole | par | A raw | B raw | winner | A pts | B pts
    //  1   |  4  |   3   |   4   |   A    |   2   |   0
    //  2   |  5  |   5   |   5   |   tie  |   1   |   1
    //  3   |  4  |   4   |   5   |   A    |   2   |   0
    //  4   |  4  |   5   |   4   |   B    |   0   |   2
    //  5   |  4  |   3   |   4   |   A    |   2   |   0
    //  6   |  3  |   3   |   3   |   tie  |   1   |   1
    //  7   |  5  |   4   |   5   |   A    |   2   |   0
    //  8   |  4  |   5   |   4   |   B    |   0   |   2
    //  9   |  3  |   2   |   3   |   A    |   2   |   0
    //                                ----  -----  -----
    //                  hole points        12     6
    //   (A: 5 wins × 2 + 2 ties × 1 = 12)
    //   (B: 2 wins × 2 + 2 ties × 1 = 6)
    // Match-win bonus to A (more hole points): +2 → 14 / 6.
    const result = individualMatchPlayScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: [3, 5, 4, 5, 3, 3, 4, 5, 2],
      bStrokes: [4, 5, 5, 4, 4, 3, 5, 4, 3],
    }));
    expect(result.teamAHolePoints).toBe(12);
    expect(result.teamBHolePoints).toBe(6);
    expect(result.teamAPoints).toBe(14); // 12 + 2 match bonus
    expect(result.teamBPoints).toBe(6);
  });

  it("scratch match tied on hole points → match bonus split", () => {
    // Mirror rounds → all 9 holes tied → 1+1 each = 9 / 9 hole points,
    // match bonus splits 2 → 1 each.
    const stroke = [4, 5, 4, 4, 4, 3, 5, 4, 3];
    const result = individualMatchPlayScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: stroke,
      bStrokes: [...stroke],
    }));
    expect(result.teamAHolePoints).toBe(9);
    expect(result.teamBHolePoints).toBe(9);
    expect(result.teamAPoints).toBe(10); // 9 + 1 split match bonus
    expect(result.teamBPoints).toBe(10);
  });

  it("handicap allocation: 5-stroke diff allocates dots on hardest 5 holes", () => {
    // A handicap = 12, B handicap = 7 → diff = 5.
    // Allocation by SI ≤ 5 → holes 1, 2, 3, 5, 7 each get 1 stroke for A.
    // (Same dots map verified in NSP and Stableford tests; allocation
    // rule is shared across formats.)
    //
    // Both shoot raw all-pars. A's net on holes-with-dots = par - 1
    // (so A wins those 5 holes outright); A and B tie on the other 4
    // holes. → A wins 5 holes (10 pts) + 4 ties (4 pts) = 14 hole pts.
    //         → B  wins 0 holes (0 pts) + 4 ties (4 pts) = 4 hole pts.
    //         → A wins the match → +2 bonus = 16. B stays at 4.
    const stroke = [4, 5, 4, 4, 4, 3, 5, 4, 3];
    const result = individualMatchPlayScorer.compute(buildInput({
      aHcp: 12, bHcp: 7,
      aStrokes: stroke,
      bStrokes: [...stroke],
    }));
    expect(result.teamAHolePoints).toBe(14);
    expect(result.teamBHolePoints).toBe(4);
    expect(result.teamAPoints).toBe(16);
    expect(result.teamBPoints).toBe(4);

    // Verify dots match the shared allocation rule.
    const expectedDots: Record<number, number> = {
      1: 1, 2: 1, 3: 1, 4: 0, 5: 1, 6: 0, 7: 1, 8: 0, 9: 0,
    };
    for (const [hole, dots] of Object.entries(expectedDots)) {
      expect(result.strokesReceivedByA[Number(hole)], `hole ${hole} A strokes`).toBe(dots);
      expect(result.strokesReceivedByB[Number(hole)], `hole ${hole} B strokes`).toBe(0);
    }
  });

  it("uses Zod defaults when config omits optional fields", () => {
    // Empty config object should hydrate pointsPerHoleWin=2 / Tie=1 /
    // pointsForMatchWin=2 via Zod defaults — important so admins
    // creating an IMP week with formatConfig: {} get sensible scoring.
    // Same scenario as the "5 wins / 2 losses / 2 ties → 14/6" case above.
    const result = individualMatchPlayScorer.compute(buildInput({
      aHcp: 0, bHcp: 0,
      aStrokes: [3, 5, 4, 5, 3, 3, 4, 5, 2],
      bStrokes: [4, 5, 5, 4, 4, 3, 5, 4, 3],
      config: {},
    }));
    expect(result.teamAPoints).toBe(14);
    expect(result.teamBPoints).toBe(6);
  });

  it("scoreShape metadata advertises per_player", () => {
    // Phase 1.5 callers will branch on this when deciding whether to
    // load team_scores or per-player score rows. Pin it in a test so
    // an accidental flip to per_team is caught immediately.
    expect(individualMatchPlayScorer.scoreShape).toBe("per_player");
  });
});
