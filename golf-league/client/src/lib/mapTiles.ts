// Satellite tile-source resolver. Defaults to Esri World Imagery (free, no
// key). When VITE_MAPBOX_TOKEN is set in the env, uses Mapbox's higher-res
// satellite-v9 with retina (@2x) tiles — noticeably crisper than Esri.
//
// To enable Mapbox:
//   1. Sign up free at https://account.mapbox.com (no credit card required)
//   2. Create a public access token (default-public restricted to your domain)
//   3. Add to .env: VITE_MAPBOX_TOKEN=pk.eyJ1...
//   4. Restart `npm run dev`
//
// Free tier is 50k tile loads / month. A round on a single hole loads roughly
// 4–9 tiles, so you'd need thousands of rounds to hit it.

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) || "";

const ESRI = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
  maxZoom: 19,
};

const MAPBOX = {
  url: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
  attribution: "&copy; <a href=\"https://www.mapbox.com/about/maps/\">Mapbox</a> &copy; <a href=\"https://www.openstreetmap.org/about/\">OpenStreetMap</a>",
  maxZoom: 22,
};

export function getSatelliteTile(): { url: string; attribution: string; maxZoom: number } {
  return MAPBOX_TOKEN ? MAPBOX : ESRI;
}

export const HAS_MAPBOX = Boolean(MAPBOX_TOKEN);
