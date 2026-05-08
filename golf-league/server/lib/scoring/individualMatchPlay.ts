// Individual Match Play.
//
// Math is identical to team_match_play (per-hole match play with a
// match-win bonus); the only thing that distinguishes IMP is that each
// side is a single PLAYER instead of a 2-man team. computeMatchup itself
// doesn't care — it operates on per-hole strokes + a handicap — so this
// scorer is a thin shape-asserting wrapper over the same engine.
//
// PHASE 1.5 DEPENDENCY — read before plumbing this into routes/UI:
//
// IMP is registered server-side but intentionally NOT exposed in the
// admin "Create week" dropdown (client/src/lib/featureFlags.ts:
// ALL_FORMATS) because the surrounding data model isn't ready:
//
//   - matchups.teamAId / teamBId are TEAM ids; IMP needs PLAYER ids
//     (or a polymorphic participant column).
//   - team_scores keys on teamId; IMP needs per-player score rows.
//   - Score entry UI writes per-team scores; IMP needs a per-player
//     entry path.
//
// Phase 1.5 of the multi-format handoff introduces a unified
// `hole_scores` table (per_team OR per_player) and a polymorphic
// matchup shape. When that lands, IMP becomes reachable end-to-end
// without changing this scorer — just by:
//
//   1. Adding `individual_match_play` to the ALL_FORMATS array.
//   2. Wiring storage.recomputeWeek to load per-player scores when
//      week.format === "individual_match_play" and call
//      scorers["individual_match_play"].compute({...}) with kind:
//      "player" participants.
//
// Until then this file ships parity-tested logic so Phase 1.5 has a
// known-good engine to plug into.

import { z } from "zod";
import { computeMatchup, type TeamForScoring, type PointsConfig, type MatchupResult } from "../scoring";
import type { Scorer, ScorerInput } from "./types";

// IMP shares the team_match_play config namespace today (same point
// values, same allowance reservation). Declared independently so an
// IMP-specific option (e.g. concession rules) can be added later without
// cross-importing — and so the registry's per-format configSchema reads
// cleanly when an admin UI renders config forms.
export const individualMatchPlayConfigSchema = z.object({
  pointsPerHoleWin: z.number().default(2),
  pointsPerHoleTie: z.number().default(1),
  pointsForMatchWin: z.number().default(2),
  /** Reserved for Phase 3 (handicap allowance). 1.0 today preserves
   *  "full handicap." Match play traditionally uses difference-based
   *  allowance — see "match_play_diff" in the brief — but that hasn't
   *  been wired up yet. */
  handicapAllowance: z.number().default(1.0),
});

export type IndividualMatchPlayConfig = z.infer<typeof individualMatchPlayConfigSchema>;

export const individualMatchPlayScorer: Scorer = {
  id: "individual_match_play",
  scoreShape: "per_player",
  configSchema: individualMatchPlayConfigSchema,
  compute(input: ScorerInput): MatchupResult {
    const cfg = individualMatchPlayConfigSchema.parse(input.config);
    // Strict shape contract: the registry-level metadata says
    // scoreShape: "per_player", and Phase 1.5 callers MUST pass kind:
    // "player" participants. Throwing on team-shaped inputs catches
    // wiring bugs at integration time rather than letting bad data
    // silently produce IMP-labeled results from team scores.
    if (input.a.kind !== "player" || input.b.kind !== "player") {
      throw new Error("individual_match_play requires both sides to be players");
    }
    // Map ParticipantRef → TeamForScoring. The struct is identically
    // shaped (id + strokes + handicap); computeMatchup uses `teamId`
    // purely as a label so passing the player id is fine.
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
