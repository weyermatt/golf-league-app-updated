// Stableford / Modified Stableford scorer.
//
// Each side plays 9 holes; raw strokes per hole are entered the same way
// as match play. Strokes are allocated by stroke index (same allocation
// rule as match play and net stroke play, so a player switching formats
// sees the same dots-per-hole table).
//
// For each hole, the side's NET score (raw - dots) is compared to par,
// and Stableford points are awarded from a configurable table:
//
//   net vs par    default points
//   ----------    --------------
//   eagle (-2)            5     (also covers albatross / better)
//   birdie (-1)           3
//   par (0)               2
//   bogey (+1)            1
//   double (+2 or worse)  0
//
// Higher Stableford total wins the matchup → pointsForWin (default 2);
// tie → pointsForTie (default 1) to both sides.
//
// MatchupResult mapping:
//   - HoleResult.aPoints / bPoints carry the per-hole Stableford points
//     (legitimate per-hole points, unlike net stroke play which has 0/0).
//   - teamAHolePoints / teamBHolePoints carry the running Stableford totals.
//   - teamAPoints / teamBPoints carry the FINAL match-outcome award
//     (pointsForWin / pointsForTie / 0). This is what the standings tally
//     consumes; the per-hole Stableford totals stay in HolePoints for the
//     scorecard rendering to show.
//
// Per-team for now (the league's data model doesn't yet have per-player
// scores in production). The math is participant-shape-agnostic — once
// the per-player score table from Phase 1.5 lands, the same scorer works
// against player-keyed scores without code changes.

import { z } from "zod";
import { allocateStrokes, type HoleResult, type MatchupResult } from "../scoring";
import type { Scorer, ScorerInput } from "./types";

export const stablefordPointsTableSchema = z.object({
  eagle: z.number().default(5),  // -2 from par or better
  birdie: z.number().default(3), // -1
  par: z.number().default(2),    //  0
  bogey: z.number().default(1),  // +1
  double: z.number().default(0), // +2 or worse
});

export type StablefordPointsTable = z.infer<typeof stablefordPointsTableSchema>;

export const stablefordConfigSchema = z.object({
  // .default with a fully-spelled object so admins can pass `formatConfig:
  // {}` and still get the standard table, even if the inner schema's
  // field-level defaults aren't applied at this nesting depth in some Zod
  // versions.
  pointsTable: stablefordPointsTableSchema.default({
    eagle: 5, birdie: 3, par: 2, bogey: 1, double: 0,
  }),
  pointsForWin: z.number().default(2),
  pointsForTie: z.number().default(1),
  /** Reserved for Phase 3 (handicap allowance). 1.0 today preserves
   *  "full handicap"; not yet applied to the handicap before allocation. */
  handicapAllowance: z.number().default(1.0),
});

export type StablefordConfig = z.infer<typeof stablefordConfigSchema>;

/** Looks up Stableford points for a single net-vs-par delta. Better than
 *  eagle (e.g. albatross at -3) collapses to the eagle value because the
 *  brief's table tops out at eagle; admins can configure higher values
 *  if the league plays a "true" Stableford. Worse than bogey collapses to
 *  the double-or-worse value. */
export function stablefordPointsForDelta(diffFromPar: number, table: StablefordPointsTable): number {
  if (diffFromPar <= -2) return table.eagle;
  if (diffFromPar === -1) return table.birdie;
  if (diffFromPar === 0) return table.par;
  if (diffFromPar === 1) return table.bogey;
  return table.double;
}

export const stablefordScorer: Scorer = {
  id: "stableford",
  scoreShape: "per_team",
  configSchema: stablefordConfigSchema,
  compute(input: ScorerInput): MatchupResult {
    const cfg = stablefordConfigSchema.parse(input.config);
    const aHcp = input.a.handicap;
    const bHcp = input.b.handicap;

    const diff = Math.round(Math.abs(aHcp - bHcp));
    let strokesA: Record<number, number> = {};
    let strokesB: Record<number, number> = {};
    if (aHcp > bHcp) {
      strokesA = allocateStrokes(input.holes, diff);
      for (const h of input.holes) strokesB[h.holeNumber] = 0;
    } else if (bHcp > aHcp) {
      strokesB = allocateStrokes(input.holes, diff);
      for (const h of input.holes) strokesA[h.holeNumber] = 0;
    } else {
      for (const h of input.holes) { strokesA[h.holeNumber] = 0; strokesB[h.holeNumber] = 0; }
    }

    let aTotal = 0;
    let bTotal = 0;
    let completedHoles = 0;
    const holeResults: HoleResult[] = [];

    for (const h of input.holes) {
      const aStr = strokesA[h.holeNumber] || 0;
      const bStr = strokesB[h.holeNumber] || 0;
      const aRaw = input.a.strokes[h.holeNumber];
      const bRaw = input.b.strokes[h.holeNumber];
      if (aRaw == null || bRaw == null) {
        holeResults.push({
          holeNumber: h.holeNumber,
          aRaw: aRaw ?? 0, bRaw: bRaw ?? 0,
          aS: aStr, bS: bStr,
          aNet: 0, bNet: 0,
          aPoints: 0, bPoints: 0,
        });
        continue;
      }
      const aNet = aRaw - aStr;
      const bNet = bRaw - bStr;
      const aPoints = stablefordPointsForDelta(aNet - h.par, cfg.pointsTable);
      const bPoints = stablefordPointsForDelta(bNet - h.par, cfg.pointsTable);
      aTotal += aPoints;
      bTotal += bPoints;
      completedHoles++;
      holeResults.push({
        holeNumber: h.holeNumber,
        aRaw, bRaw,
        aS: aStr, bS: bStr,
        aNet, bNet,
        aPoints, bPoints,
      });
    }

    let aFinal = 0;
    let bFinal = 0;
    if (completedHoles > 0 && completedHoles === input.holes.length) {
      if (aTotal > bTotal) { aFinal = cfg.pointsForWin; bFinal = 0; }
      else if (bTotal > aTotal) { aFinal = 0; bFinal = cfg.pointsForWin; }
      else { aFinal = cfg.pointsForTie; bFinal = cfg.pointsForTie; }
    }

    return {
      teamAPoints: aFinal,
      teamBPoints: bFinal,
      holes: holeResults,
      teamAHandicap: aHcp,
      teamBHandicap: bHcp,
      strokesReceivedByA: strokesA,
      strokesReceivedByB: strokesB,
      // Per-hole Stableford totals — surfaced separately from the
      // match-outcome `teamAPoints` so the scorecard can show them.
      teamAHolePoints: aTotal,
      teamBHolePoints: bTotal,
    };
  },
};
