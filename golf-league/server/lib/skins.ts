// Skins computation. Gross only.
// Each hole stands alone: a skin is awarded ONLY when exactly one team has the
// lowest score on that hole across the entire field. Tied low = wash (no skin,
// no carryover, no rollup).
// Team-keyed: input is one row per team per hole, output names a winning teamId.

export interface SkinsScoreInput {
  teamId: number;
  holeNumber: number;
  strokes: number;
}

export interface SkinResult {
  holeNumber: number;
  teamId: number | null; // null = carryover (no winner this hole)
  carryoverCount: number; // how many skins this hole is worth (>=1)
}

/**
 * Compute skins for a set of team scores, restricted to a "field" (set of team ids).
 * Each hole stands alone:
 *   - Exactly one team with the unique low score → that team wins 1 skin.
 *   - Two or more tied for low → wash, no skin awarded, no carryover.
 *   - No scores recorded for the hole → no skin (and no payout effect).
 * carryoverCount stays in the output shape for backward compatibility but is
 * always 1 on a winning row and 0 on a tied/empty row.
 */
export function computeSkins(
  scores: SkinsScoreInput[],
  fieldTeamIds: Set<number>,
): SkinResult[] {
  const byHole: Record<number, SkinsScoreInput[]> = {};
  for (const s of scores) {
    if (!fieldTeamIds.has(s.teamId)) continue;
    if (!byHole[s.holeNumber]) byHole[s.holeNumber] = [];
    byHole[s.holeNumber].push(s);
  }
  const results: SkinResult[] = [];
  for (let hole = 1; hole <= 9; hole++) {
    const list = byHole[hole] || [];
    if (list.length === 0) {
      results.push({ holeNumber: hole, teamId: null, carryoverCount: 0 });
      continue;
    }
    const min = Math.min(...list.map(s => s.strokes));
    const winners = list.filter(s => s.strokes === min);
    if (winners.length === 1) {
      results.push({ holeNumber: hole, teamId: winners[0].teamId, carryoverCount: 1 });
    } else {
      // Tie → wash. No skin, no carryover.
      results.push({ holeNumber: hole, teamId: null, carryoverCount: 0 });
    }
  }
  return results;
}

/**
 * Matchup-only skins: each matchup is a 2-team field with its own carryover.
 */
export function computeSkinsByMatchup(
  scores: SkinsScoreInput[],
  matchups: { teamAId: number; teamBId: number }[],
): SkinResult[] {
  const out: SkinResult[] = [];
  for (const m of matchups) {
    const field = new Set([m.teamAId, m.teamBId]);
    const sub = computeSkins(scores, field);
    out.push(...sub);
  }
  return out;
}
