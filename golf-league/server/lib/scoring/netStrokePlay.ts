// Net Stroke Play scorer.
//
// Both sides play a 9-hole round; raw strokes per hole are entered the
// same way as match play. The higher-handicap side gets allocated strokes
// against the lower-handicap side (same allocation rule as match play, so
// allocateStrokes is reused), then each side's net total is summed and
// compared:
//
//   - Lower net total wins → pointsForWin (default 2)
//   - Tied net totals       → pointsForTie  (default 1) to each
//
// Unlike match play there's no per-hole point award and no match-win
// bonus — net stroke play is a single comparison at the end. The
// MatchupResult shape is preserved (HoleResult.aPoints/bPoints are 0 for
// every hole) so downstream UI/storage doesn't have to special-case the
// container; format-aware UI in Phase 2b will hide the per-hole points
// row when format is net_stroke_play.
//
// Per-team only for now. The same scorer would work per-player once the
// per-player score table from Phase 1.5 lands (the input shape doesn't
// change — `input.a` would just carry kind="player" and a single player's
// strokes).

import { z } from "zod";
import { allocateStrokes, type HoleResult, type MatchupResult } from "../scoring";
import type { Scorer, ScorerInput } from "./types";

export const netStrokePlayConfigSchema = z.object({
  pointsForWin: z.number().default(2),
  pointsForTie: z.number().default(1),
  /** Reserved for Phase 3. 1.0 today preserves "full handicap." Not yet
   *  applied to the handicap before stroke allocation. */
  handicapAllowance: z.number().default(1.0),
});

export type NetStrokePlayConfig = z.infer<typeof netStrokePlayConfigSchema>;

export const netStrokePlayScorer: Scorer = {
  id: "net_stroke_play",
  scoreShape: "per_team",
  configSchema: netStrokePlayConfigSchema,
  compute(input: ScorerInput): MatchupResult {
    const cfg = netStrokePlayConfigSchema.parse(input.config);
    const aHcp = input.a.handicap;
    const bHcp = input.b.handicap;

    // Same stroke-allocation rule as match play: the higher-handicap side
    // receives `|aHcp - bHcp|` strokes spread across the hardest holes by
    // stroke index. Reusing allocateStrokes keeps the two formats
    // consistent so a player switching formats sees the same dots on the
    // scorecard.
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

    let aNetTotal = 0;
    let bNetTotal = 0;
    let completedHoles = 0;
    const holeResults: HoleResult[] = [];

    for (const h of input.holes) {
      const aStr = strokesA[h.holeNumber] || 0;
      const bStr = strokesB[h.holeNumber] || 0;
      const aRaw = input.a.strokes[h.holeNumber];
      const bRaw = input.b.strokes[h.holeNumber];
      if (aRaw == null || bRaw == null) {
        // Same partial-round handling as computeMatchup: emit a zeroed
        // HoleResult so the downstream view always sees 9 entries, but
        // skip from the totals so an unfinished round can't produce a
        // bogus winner.
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
      aNetTotal += aNet;
      bNetTotal += bNet;
      completedHoles++;
      holeResults.push({
        holeNumber: h.holeNumber,
        aRaw, bRaw,
        aS: aStr, bS: bStr,
        aNet, bNet,
        // No per-hole points in stroke play — match awarded on totals.
        aPoints: 0, bPoints: 0,
      });
    }

    let aPts = 0;
    let bPts = 0;
    // Award the match outcome only when the round is fully entered. A
    // partial round leaves both sides at 0 points (matching computeMatchup's
    // skip-on-incomplete behavior in storage.recomputeWeek).
    if (completedHoles > 0 && completedHoles === input.holes.length) {
      if (aNetTotal < bNetTotal) { aPts = cfg.pointsForWin; bPts = 0; }
      else if (bNetTotal < aNetTotal) { aPts = 0; bPts = cfg.pointsForWin; }
      else { aPts = cfg.pointsForTie; bPts = cfg.pointsForTie; }
    }

    return {
      teamAPoints: aPts,
      teamBPoints: bPts,
      holes: holeResults,
      teamAHandicap: aHcp,
      teamBHandicap: bHcp,
      strokesReceivedByA: strokesA,
      strokesReceivedByB: strokesB,
      // No running per-hole point totals in stroke play. Format-aware UI
      // hides the "Pts" row when format !== team_match_play.
      teamAHolePoints: 0,
      teamBHolePoints: 0,
    };
  },
};
