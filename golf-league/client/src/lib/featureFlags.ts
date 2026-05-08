// Build-time feature flags, sourced from Vite env vars. Mirrors the existing
// VITE_MAPTILER_TOKEN / VITE_MAPBOX_TOKEN pattern (see lib/mapTiles.ts):
// flip the flag in .env, restart `npm run dev` (or rebuild), feature appears.
//
// To enable new scoring formats (Phase 2 — Net Stroke Play, Stableford,
// Individual Match Play) in the admin "Create week" dropdown:
//
//   echo "VITE_ENABLE_NEW_FORMATS=true" >> .env && npm run dev
//
// When the flag is off, the dropdown only offers Match Play (Team), which
// is the format the league has run since v1. New formats are still
// registered server-side; without the dropdown there's just no path to
// create a week with format != team_match_play in production.

export const enableNewFormats: boolean =
  String(import.meta.env.VITE_ENABLE_NEW_FORMATS ?? "").toLowerCase() === "true";

/** Ordered list of formats the admin can pick from. The first entry is
 *  always team_match_play (the only option when the flag is off). New
 *  formats appear on the end so existing admins see the same default. */
export interface FormatOption {
  id: string;
  label: string;
  description: string;
  /** True only when the format is gated behind enableNewFormats. */
  experimental: boolean;
}

const ALL_FORMATS: FormatOption[] = [
  {
    id: "team_match_play",
    label: "Match Play (Team)",
    description: "2-man best-ball with per-hole points and a match-win bonus. The league default.",
    experimental: false,
  },
  {
    id: "net_stroke_play",
    label: "Net Stroke Play",
    description: "Lower 9-hole net total wins. Simple win/tie/loss point award; no per-hole points.",
    experimental: true,
  },
];

export function availableFormats(): FormatOption[] {
  return ALL_FORMATS.filter(f => !f.experimental || enableNewFormats);
}

export function formatLabel(id: string): string {
  return ALL_FORMATS.find(f => f.id === id)?.label ?? id;
}
