// Parity gate for the Phase 1 scoring engine refactor.
//
// For every played matchup in fixtures/parity-snapshot.json, we:
//   1. Reconstruct the inputs that the live engine had at recompute time
//      (team handicaps via the same playingHcp rules, scratch overrides,
//      hole pars/SI, and settings-derived points config).
//   2. Run scorers["team_match_play"].compute(input).
//   3. Assert that teamAPoints / teamBPoints come out within 0.5 of the
//      values the prod engine stored on the matchup row.
//
// The fixture was extracted live from the prod API (see fixture._meta), so
// the stored teamAPoints/teamBPoints are the ground truth: the parity gate
// fails the moment the new registry pipeline diverges from prod scoring
// math by half a point on any historical matchup.
//
// 0.5 tolerance per the owner's hard rule. Tighter than that the moment
// any of the existing scoring math is changed; we don't want to slip
// drift past the gate.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getScorer } from "./registry";

const MAX_POINT_DIVERGENCE = 0.5;

type Hole = { id: number; courseId: number; holeNumber: number; par: number; strokeIndex: number; yards: number | null };
type Course = { id: number; name: string; layout: string; courseRating: number | null; slope: number | null; catalogCourseId: number | null; startHole: number | null };
type Team = { id: number; name: string; captainId: number; mateId: number; currentHandicap: number | null; startingHandicap: number | null; handicapStartWeek: number; active: boolean };
type Week = { id: number; weekNumber: number; date: string; courseId: number; notes: string | null };
type Matchup = { id: number; weekId: number; teamAId: number; teamBId: number; teamAPoints: number | null; teamBPoints: number | null; teamAScratch: boolean; teamBScratch: boolean };
type TeamScore = { id: number; weekId: number; teamId: number; holeNumber: number; strokes: number };
type ThhRow = { weekId: number; differential: number; handicapAfter: number };
type Settings = {
  pointsPerHoleWin: number; pointsPerHoleTie: number; pointsForMatchWin: number;
  holeMaxStrokes: number; handicapFactor: number; handicapRules: string;
  skinsScope: string; teamHandicapFormula: string; skinsPotPerWeek: number;
};

interface Fixture {
  settings: Settings;
  courses: Course[];
  holes: Hole[];
  teams: Team[];
  weeks: Week[];
  matchups: Matchup[];
  team_scores: TeamScore[];
  team_handicap_history: Record<string, ThhRow[]>;
}

// __dirname here is server/lib/scoring/; the fixture lives at
// golf-league/fixtures/parity-snapshot.json — three levels up.
const fixturePath = path.resolve(__dirname, "../../../fixtures/parity-snapshot.json");
const fixture: Fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

// ---- Indexed lookups, computed once ----

const weekById = new Map<number, Week>(fixture.weeks.map(w => [w.id, w]));
const teamById = new Map<number, Team>(fixture.teams.map(t => [t.id, t]));
const holesByCourse = new Map<number, Hole[]>();
for (const h of fixture.holes) {
  const arr = holesByCourse.get(h.courseId) ?? [];
  arr.push(h);
  holesByCourse.set(h.courseId, arr);
}
for (const arr of holesByCourse.values()) arr.sort((a, b) => a.holeNumber - b.holeNumber);

const teamScoresByWeekTeam = new Map<string, Record<number, number>>();
for (const s of fixture.team_scores) {
  const k = `${s.weekId}:${s.teamId}`;
  if (!teamScoresByWeekTeam.has(k)) teamScoresByWeekTeam.set(k, {});
  teamScoresByWeekTeam.get(k)![s.holeNumber] = s.strokes;
}

/** Replicates server/storage.ts:playingHcp — most recent team_handicap_history
 *  row strictly before this week's weekNumber, falling back to startingHandicap
 *  if no prior history, falling back to 0 if neither. Pre-handicapStartWeek
 *  weeks force scratch (0). Read-only against the fixture; no DB needed. */
function playingHcp(teamId: number, week: Week): number {
  const team = teamById.get(teamId);
  if (!team) return 0;
  if (week.weekNumber < (team.handicapStartWeek ?? 1)) return 0;
  const history = fixture.team_handicap_history[String(teamId)] ?? [];
  let best: { wn: number; v: number } | null = null;
  for (const r of history) {
    const wk = weekById.get(r.weekId);
    if (!wk) continue;
    if (wk.weekNumber < week.weekNumber) {
      if (!best || wk.weekNumber > best.wn) best = { wn: wk.weekNumber, v: r.handicapAfter };
    }
  }
  if (!best) return team.startingHandicap ?? 0;
  return best.v;
}

const playedMatchups = fixture.matchups.filter(m => m.teamAPoints != null && m.teamBPoints != null);

describe("scoring parity: registry vs prod-stored points", () => {
  it("fixture has played matchups to test against", () => {
    expect(playedMatchups.length).toBeGreaterThan(0);
  });

  // One named test per matchup. vitest reports each by name so a regression
  // points straight at the offending matchup id (and its week) without
  // requiring the developer to dig through a single mega-test's stack.
  for (const m of playedMatchups) {
    const week = weekById.get(m.weekId)!;
    const courseHoles = holesByCourse.get(week.courseId) ?? [];
    const aTeam = teamById.get(m.teamAId)!;
    const bTeam = teamById.get(m.teamBId)!;
    const label = `week ${week.weekNumber} matchup #${m.id} — ${aTeam.name} vs ${bTeam.name}`;

    it(label, () => {
      const aScores = teamScoresByWeekTeam.get(`${m.weekId}:${m.teamAId}`) ?? {};
      const bScores = teamScoresByWeekTeam.get(`${m.weekId}:${m.teamBId}`) ?? {};
      // Skip incomplete rounds — recomputeWeek does the same thing so they
      // wouldn't have produced points in prod either, and the fixture marks
      // them with non-null points only if all 9 holes are in.
      const fully = (s: Record<number, number>) => Object.keys(s).length === 9;
      expect(fully(aScores), `${label}: team A has all 9 holes`).toBe(true);
      expect(fully(bScores), `${label}: team B has all 9 holes`).toBe(true);

      const aHcp = m.teamAScratch ? 0 : playingHcp(m.teamAId, week);
      const bHcp = m.teamBScratch ? 0 : playingHcp(m.teamBId, week);

      const result = getScorer("team_match_play").compute({
        a: { id: m.teamAId, kind: "team", strokes: aScores, handicap: aHcp },
        b: { id: m.teamBId, kind: "team", strokes: bScores, handicap: bHcp },
        holes: courseHoles.map(h => ({ holeNumber: h.holeNumber, par: h.par, strokeIndex: h.strokeIndex })),
        config: {
          pointsPerHoleWin: fixture.settings.pointsPerHoleWin,
          pointsPerHoleTie: fixture.settings.pointsPerHoleTie,
          pointsForMatchWin: fixture.settings.pointsForMatchWin,
        },
      });

      const aDelta = Math.abs(result.teamAPoints - m.teamAPoints!);
      const bDelta = Math.abs(result.teamBPoints - m.teamBPoints!);

      // Hard fail with explicit numbers in the message — when this trips on
      // CI the developer needs to see what the engine returned vs the
      // prod-stored ground truth without re-running locally.
      if (aDelta >= MAX_POINT_DIVERGENCE || bDelta >= MAX_POINT_DIVERGENCE) {
        throw new Error(
          `${label}: divergence exceeds tolerance. ` +
          `A: stored=${m.teamAPoints} engine=${result.teamAPoints} delta=${aDelta}. ` +
          `B: stored=${m.teamBPoints} engine=${result.teamBPoints} delta=${bDelta}. ` +
          `(tolerance: <${MAX_POINT_DIVERGENCE})`
        );
      }
      expect(aDelta).toBeLessThan(MAX_POINT_DIVERGENCE);
      expect(bDelta).toBeLessThan(MAX_POINT_DIVERGENCE);
    });
  }
});
