// Match scoring with stroke allocation by stroke index.
// Team-only / Captain & Mate best-ball: ONE team score per hole (the better ball,
// already chosen at score-entry time). Net score = team raw - team strokes received.
// Pure functions.

export interface HoleInfo {
  holeNumber: number;
  par: number;
  strokeIndex: number; // 1..9 (1 = hardest)
}

/** Single team score per hole (the team's best-ball score). */
export interface TeamForScoring {
  teamId: number;
  /** raw team strokes by hole number 1..9 */
  strokes: Record<number, number>;
  /** 9-hole team handicap going INTO this week (rolling). */
  handicap: number;
}

export interface PointsConfig {
  pointsPerHoleWin: number;
  pointsPerHoleTie: number;
  pointsForMatchWin: number;
}

/** Allocate strokes received per hole based on stroke index.
 *  receivingStrokes = how many total strokes this side receives (>=0).
 *  Strokes go first to lowest stroke-index holes (1 = hardest). If
 *  receivingStrokes > 9 the cycle wraps so SI 1 gets 2nd stroke etc.
 *  Returns map holeNumber -> strokesOnHole.
 */
export function allocateStrokes(
  holes: HoleInfo[],
  receivingStrokes: number,
): Record<number, number> {
  const map: Record<number, number> = {};
  for (const h of holes) map[h.holeNumber] = 0;
  if (receivingStrokes <= 0) return map;
  const ordered = [...holes].sort((a, b) => a.strokeIndex - b.strokeIndex);
  let remaining = receivingStrokes;
  let pass = 0;
  while (remaining > 0) {
    for (const h of ordered) {
      if (remaining <= 0) break;
      map[h.holeNumber] += 1;
      remaining--;
    }
    pass++;
    if (pass > 20) break; // safety
  }
  return map;
}

export interface MatchupResult {
  teamAPoints: number;
  teamBPoints: number;
  holes: HoleResult[];
  teamAHandicap: number;
  teamBHandicap: number;
  // strokes received for each side per hole (the side that gets strokes)
  strokesReceivedByA: Record<number, number>;
  strokesReceivedByB: Record<number, number>;
  teamAHolePoints: number; // running hole points (without match bonus)
  teamBHolePoints: number;
}

export interface HoleResult {
  holeNumber: number;
  // raw team scores (best-ball)
  aRaw: number;
  bRaw: number;
  // strokes received this hole
  aS: number;
  bS: number;
  // net per team
  aNet: number;
  bNet: number;
  // points awarded this hole
  aPoints: number;
  bPoints: number;
}

export function computeMatchup(
  teamA: TeamForScoring,
  teamB: TeamForScoring,
  holes: HoleInfo[], // 9 holes
  cfg: PointsConfig,
): MatchupResult {
  const aHcp = teamA.handicap;
  const bHcp = teamB.handicap;
  const diff = Math.round(Math.abs(aHcp - bHcp));
  // The higher-handicap team receives strokes
  let strokesA: Record<number, number> = {};
  let strokesB: Record<number, number> = {};
  if (aHcp > bHcp) {
    strokesA = allocateStrokes(holes, diff);
    for (const h of holes) strokesB[h.holeNumber] = 0;
  } else if (bHcp > aHcp) {
    strokesB = allocateStrokes(holes, diff);
    for (const h of holes) strokesA[h.holeNumber] = 0;
  } else {
    for (const h of holes) { strokesA[h.holeNumber] = 0; strokesB[h.holeNumber] = 0; }
  }

  let aPts = 0, bPts = 0;
  const holeResults: HoleResult[] = [];

  for (const h of holes) {
    const aStr = strokesA[h.holeNumber] || 0;
    const bStr = strokesB[h.holeNumber] || 0;
    const aRaw = teamA.strokes[h.holeNumber];
    const bRaw = teamB.strokes[h.holeNumber];
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
    let pa = 0, pb = 0;
    if (aNet < bNet) { pa = cfg.pointsPerHoleWin; pb = 0; }
    else if (bNet < aNet) { pa = 0; pb = cfg.pointsPerHoleWin; }
    else { pa = cfg.pointsPerHoleTie; pb = cfg.pointsPerHoleTie; }
    aPts += pa; bPts += pb;
    holeResults.push({
      holeNumber: h.holeNumber,
      aRaw, bRaw,
      aS: aStr, bS: bStr,
      aNet, bNet,
      aPoints: pa, bPoints: pb,
    });
  }

  const aHolePts = aPts;
  const bHolePts = bPts;

  // Match-win bonus
  if (aPts > bPts) aPts += cfg.pointsForMatchWin;
  else if (bPts > aPts) bPts += cfg.pointsForMatchWin;
  else { aPts += cfg.pointsForMatchWin / 2; bPts += cfg.pointsForMatchWin / 2; }

  return {
    teamAPoints: aPts,
    teamBPoints: bPts,
    holes: holeResults,
    teamAHandicap: aHcp,
    teamBHandicap: bHcp,
    strokesReceivedByA: strokesA,
    strokesReceivedByB: strokesB,
    teamAHolePoints: aHolePts,
    teamBHolePoints: bHolePts,
  };
}
