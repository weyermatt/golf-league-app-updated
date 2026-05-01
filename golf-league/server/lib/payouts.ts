// Skins money payouts.
//
// Rules (from the user):
//   - Each week's pot is `potPerWeek` (default $200).
//   - If at least one skin is awarded that week, the weekly pot is divided
//     by the TOTAL NUMBER OF SKINS won that week to get a per-skin dollar
//     amount. Each team's payout = (skins they won) × per-skin amount.
//     e.g. $200 pot, 5 skins → $40/skin. Team with 3 skins gets $120, etc.
//   - Each week stands alone — no rollover between weeks. Rollover-related
//     fields are retained on WeekPayout/PayoutSummary for backward compat
//     with the API surface, but are always zero.
//
// "Skin awarded" = a `skins` row with a non-null `teamId`. Tied holes
// (teamId null) do not contribute to the payout. A `carryoverCount` of N
// means that one row counts as N skins (e.g. a hole won outright after two
// prior holes tied = 3 skins on that hole).

export interface SkinRow {
  weekId: number;
  holeNumber: number;
  teamId: number | null;
  carryoverCount: number;
}

export interface WeekRow {
  id: number;
  weekNumber: number;
}

export interface WeekPayout {
  weekId: number;
  weekNumber: number;
  potThisWeek: number;        // potPerWeek for this week
  rolloverIn: number;          // money carried in from prior weeks
  availablePot: number;        // potThisWeek + rolloverIn
  skinsAwarded: number;        // sum of carryoverCount across won holes
  winningTeams: number;        // count of distinct teams that won ≥1 skin
  perTeamAmount: number;       // availablePot / winningTeams (0 if none)
  perSkinAmount: number;       // legacy field; equals perTeamAmount for compatibility
  rolloverOut: number;         // money carried to next week (0 if any skins won)
  payouts: Record<number, number>; // teamId -> $ won this week
}

export interface PayoutSummary {
  byWeek: WeekPayout[];
  currentRollover: number;       // money sitting in pot right now (for next unplayed week)
  totalByTeam: Record<number, number>; // teamId -> total $ won across season
}

/**
 * Compute season-wide skin payouts.
 *
 * @param weeks   All weeks, sorted by weekNumber ascending. Only weeks that have
 *                at least one skins row are considered "played" for payout purposes.
 * @param skins   All skins rows.
 * @param potPerWeek  Dollar amount added to the pot each played week.
 */
export function computePayouts(
  weeks: WeekRow[],
  skins: SkinRow[],
  potPerWeek: number,
): PayoutSummary {
  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const skinsByWeek: Record<number, SkinRow[]> = {};
  for (const s of skins) {
    if (!skinsByWeek[s.weekId]) skinsByWeek[s.weekId] = [];
    skinsByWeek[s.weekId].push(s);
  }

  const byWeek: WeekPayout[] = [];
  const totalByTeam: Record<number, number> = {};
  let rollover = 0;

  for (const w of sortedWeeks) {
    const wkSkins = skinsByWeek[w.id] || [];
    if (wkSkins.length === 0) {
      // Week has no skins computed yet (incomplete or unscored). Don't add the
      // weekly pot — wait until the week actually has results posted.
      continue;
    }
    const available = potPerWeek; // no rollover — each week stands alone
    const wonRows = wkSkins.filter(s => s.teamId != null);
    const skinsAwarded = wonRows.reduce((a, b) => a + b.carryoverCount, 0);
    const distinctWinners = new Set(wonRows.map(r => r.teamId!));
    const winningTeams = distinctWinners.size;

    const wp: WeekPayout = {
      weekId: w.id,
      weekNumber: w.weekNumber,
      potThisWeek: potPerWeek,
      rolloverIn: 0,
      availablePot: available,
      skinsAwarded,
      winningTeams,
      perTeamAmount: 0,
      perSkinAmount: 0,
      rolloverOut: 0,
      payouts: {},
    };

    if (skinsAwarded === 0) {
      // No skins won this week. With no rollover, the pot simply isn't paid
      // out — chances of every hole tying across 10 teams are negligible.
      wp.rolloverOut = 0;
    } else {
      // Per-skin payout: split the pot by the total skin count, then pay
      // each team proportional to how many skins they won.
      const perSkin = available / skinsAwarded;
      wp.perSkinAmount = perSkin;
      // Sum skins per team (a team may win on multiple holes, and a single
      // hole may carry a multi-skin carryoverCount).
      const skinsByTeam: Record<number, number> = {};
      for (const r of wonRows) {
        skinsByTeam[r.teamId!] = (skinsByTeam[r.teamId!] || 0) + r.carryoverCount;
      }
      for (const [tidStr, count] of Object.entries(skinsByTeam)) {
        const tid = Number(tidStr);
        const amount = perSkin * count;
        wp.payouts[tid] = amount;
        totalByTeam[tid] = (totalByTeam[tid] || 0) + amount;
      }
      // Legacy field: perTeamAmount no longer has a single meaningful value
      // under per-skin payouts. Keep it as the per-skin amount for any old
      // UI code that still references it.
      wp.perTeamAmount = perSkin;
    }
    byWeek.push(wp);
  }

  return {
    byWeek,
    currentRollover: rollover,
    totalByTeam,
  };
}
