// Format-pluggable scoring interface. Phase 1 only registers
// `team_match_play` (a wrapper around the existing computeMatchup), but the
// shape is sized for the future Tier 1 formats described in the multi-format
// handoff: individual_match_play, stableford, net_stroke_play.
//
// This file intentionally keeps the legacy `MatchupResult` shape on the
// output so the parity test can byte-compare against the pre-refactor
// computeMatchup result without coercion.

import type { z } from "zod";
import type { HoleInfo, MatchupResult } from "../scoring";

/** A reference to one of the (up to two) sides in a matchup-style format. */
export interface ParticipantRef {
  /** Team id for per-team formats; player id for per-player formats. */
  id: number;
  kind: "team" | "player";
  /** Handicap going into this matchup (already adjusted for scratch/sub). */
  handicap: number;
  /** Raw strokes by hole number (1..9). Best-ball if kind=team. */
  strokes: Record<number, number>;
}

/** Input to a scorer. Matchup-style scorers operate on a single A/B pair;
 *  league-wide formats (stableford, net stroke play) will extend this with
 *  a `field` field carrying every participant. Phase 1 only needs the pair. */
export interface ScorerInput {
  /** Participant on side A. Always present for matchup-style formats. */
  a: ParticipantRef;
  /** Participant on side B. Always present for matchup-style formats. */
  b: ParticipantRef;
  /** Course holes for this round (length 9 in this league). */
  holes: HoleInfo[];
  /** Format-specific config validated against `Scorer.configSchema`. */
  config: unknown;
}

export interface Scorer {
  /** Stable identifier matching `weeks.format` values. */
  id: string;
  /** Whether this format reads per-team or per-player score rows. */
  scoreShape: "per_team" | "per_player";
  /** Zod schema for `format_config`. Lets routes parse incoming JSON safely. */
  configSchema: z.ZodType;
  /** Pure compute. No DB, no I/O, no clock. */
  compute(input: ScorerInput): MatchupResult;
}
