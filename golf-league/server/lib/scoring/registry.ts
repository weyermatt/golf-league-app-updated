// Format registry. New scorers register themselves here; the rest of the
// app routes through `getScorer(formatId)` instead of importing concrete
// implementations.
//
// Phase 1 only registers `team_match_play`. Future Tier 1 formats land as
// sibling files (individualMatchPlay.ts, stableford.ts, netStrokePlay.ts)
// each exporting a `Scorer` and adding themselves to the map below.

import type { Scorer } from "./types";
import { teamMatchPlayScorer } from "./teamMatchPlay";
import { netStrokePlayScorer } from "./netStrokePlay";
import { stablefordScorer } from "./stableford";

export const scorers: Record<string, Scorer> = {
  [teamMatchPlayScorer.id]: teamMatchPlayScorer,
  [netStrokePlayScorer.id]: netStrokePlayScorer,
  [stablefordScorer.id]: stablefordScorer,
};

/** Default format used when a week has no `format` column value (older rows
 *  written before Phase 1) and when a new week is created without a choice.
 *  Backfilling existing rows to this value is part of the Phase 1 migration. */
export const DEFAULT_FORMAT = teamMatchPlayScorer.id;

export function getScorer(formatId: string): Scorer {
  const s = scorers[formatId];
  if (!s) {
    throw new Error(
      `Unknown scoring format "${formatId}". Registered: [${Object.keys(scorers).join(", ")}]`,
    );
  }
  return s;
}
