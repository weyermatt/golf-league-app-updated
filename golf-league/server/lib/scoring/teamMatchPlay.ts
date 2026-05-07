// 2-Man Team Best-Ball Match Play with Points — the format the league has
// been running since v1. This scorer is a thin shell around the existing
// `computeMatchup` function in ../scoring.ts; the math hasn't moved. The
// indirection exists so future formats can sit alongside this one in the
// registry without touching the live engine.
//
// Parity contract: the output of this scorer must be byte-equal to the
// output of `computeMatchup(a, b, holes, cfg)` for every historical matchup
// in fixtures/parity-snapshot.json. See server/lib/scoring/parity.test.ts.

import { z } from "zod";
import { computeMatchup, type TeamForScoring, type PointsConfig, type MatchupResult } from "../scoring";
import type { Scorer, ScorerInput } from "./types";

export const teamMatchPlayConfigSchema = z.object({
  pointsPerHoleWin: z.number(),
  pointsPerHoleTie: z.number(),
  pointsForMatchWin: z.number(),
  /** Reserved for Phase 3 (handicap allowance). 1.0 today preserves the
   *  current "full handicap" behavior. Not yet wired into compute(). */
  handicapAllowance: z.number().default(1.0),
});

export type TeamMatchPlayConfig = z.infer<typeof teamMatchPlayConfigSchema>;

export const teamMatchPlayScorer: Scorer = {
  id: "team_match_play",
  scoreShape: "per_team",
  configSchema: teamMatchPlayConfigSchema,
  compute(input: ScorerInput): MatchupResult {
    const cfg = teamMatchPlayConfigSchema.parse(input.config);
    if (input.a.kind !== "team" || input.b.kind !== "team") {
      throw new Error("team_match_play requires both sides to be teams");
    }
    const a: TeamForScoring = { teamId: input.a.id, strokes: input.a.strokes, handicap: input.a.handicap };
    const b: TeamForScoring = { teamId: input.b.id, strokes: input.b.strokes, handicap: input.b.handicap };
    const points: PointsConfig = {
      pointsPerHoleWin: cfg.pointsPerHoleWin,
      pointsPerHoleTie: cfg.pointsPerHoleTie,
      pointsForMatchWin: cfg.pointsForMatchWin,
    };
    return computeMatchup(a, b, input.holes, points);
  },
};
