// Handicap calculations (9-hole, GHIN-style adjusted).
// Pure functions — all data and settings passed in.

export interface HandicapHoleInput {
  holeNumber: number;
  par: number;
  strokes: number; // raw strokes
}

export interface HandicapCourseInfo {
  par9: number; // sum of pars across the 9 holes
  courseRating: number | null;
  slope: number | null;
}

export interface HandicapSettings {
  holeMaxStrokes: number; // ESC cap per hole
  handicapFactor: number; // 0.96
  handicapRules: string; // e.g. "1/1,1/2,1/3,2/4,3/5"
}

/** Apply per-hole ESC cap then sum to get adjusted gross. */
export function adjustedGross(holes: HandicapHoleInput[], holeMax: number): number {
  let total = 0;
  for (const h of holes) {
    total += Math.min(h.strokes, holeMax);
  }
  return total;
}

/** Compute the 9-hole differential.
 *  If course rating + slope provided: (adjGross - rating) * 113 / slope.
 *  Else fall back to: adjGross - par9.
 */
export function computeDifferential(
  adjGross: number,
  course: HandicapCourseInfo,
): number {
  if (course.courseRating != null && course.slope != null && course.slope > 0) {
    return ((adjGross - course.courseRating) * 113) / course.slope;
  }
  return adjGross - course.par9;
}

/** Parse rules like "1/1,1/2,1/3,2/4,3/5" into array [{best,last}, ...].
 *  best = how many lowest differentials to average,
 *  last = window of recent rounds to consider.
 */
export function parseHandicapRules(rules: string): { best: number; last: number }[] {
  return rules.split(",").map(s => {
    const [b, l] = s.trim().split("/").map(Number);
    return { best: b || 1, last: l || 1 };
  });
}

/** Pick the rule for a given number of rounds. If rounds exceed table, use last. */
export function pickRule(rules: { best: number; last: number }[], rounds: number) {
  if (rounds <= 0) return null;
  if (rounds <= rules.length) return rules[rounds - 1];
  return rules[rules.length - 1];
}

/** Given chronological list of differentials (oldest first), and rules + factor,
 *  compute the rolling handicap AFTER the most recent round.
 */
export function rollingHandicap(
  differentials: number[], // chronological oldest -> newest
  settings: HandicapSettings,
): number | null {
  if (differentials.length === 0) return null;
  const rules = parseHandicapRules(settings.handicapRules);
  const rule = pickRule(rules, differentials.length);
  if (!rule) return null;
  const window = differentials.slice(-rule.last); // last N rounds
  const sorted = [...window].sort((a, b) => a - b);
  const best = sorted.slice(0, rule.best);
  const avg = best.reduce((s, x) => s + x, 0) / best.length;
  return Math.round(avg * settings.handicapFactor * 10) / 10; // 1 decimal
}

/** Convenience: given player's chronological round records (each contributes one
 *  differential), return an array of (handicapAfter) — the handicap the player
 *  carries AFTER each round. handicapAfter[i] uses differentials[0..i].
 */
export function rollingHistory(
  differentials: number[],
  settings: HandicapSettings,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < differentials.length; i++) {
    out.push(rollingHandicap(differentials.slice(0, i + 1), settings));
  }
  return out;
}

/** Player's "playing" 9-hole handicap going INTO a week is their handicap AFTER
 *  the previous round. For week 1 (no prior rounds) the playing handicap is 0.
 *  This helper picks the handicapAfter from the most recent round prior to
 *  weekDate.
 */
export function playingHandicapBefore(
  history: { weekDate: string; handicapAfter: number }[],
  currentWeekDate: string,
): number {
  const prior = history
    .filter(h => h.weekDate < currentWeekDate)
    .sort((a, b) => a.weekDate.localeCompare(b.weekDate));
  if (prior.length === 0) return 0;
  return prior[prior.length - 1].handicapAfter;
}
