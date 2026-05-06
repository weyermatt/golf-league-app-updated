// Satellite tile-source resolver. Defaults to Esri World Imagery (free, no
// key). When VITE_MAPTILER_TOKEN or VITE_MAPBOX_TOKEN is set in the env,
// uses that provider's higher-resolution satellite tiles. Precedence:
// MapTiler > Mapbox > Esri.
//
// To enable MapTiler (preferred — straightforward signup, no card required):
//   1. Sign up free at https://www.maptiler.com/cloud/
//   2. Copy your API key from the cloud dashboard
//   3. Add to .env: VITE_MAPTILER_TOKEN=your_key_here
//   4. Restart `npm run dev`
//   Free tier: 100k tile loads / month.
//
// To enable Mapbox (alternative):
//   1. Sign up at https://account.mapbox.com (now requires a card)
//   2. Create a public access token (default-public restricted to your domain)
//   3. Add to .env: VITE_MAPBOX_TOKEN=pk.eyJ1...
//   4. Restart `npm run dev`
//   Free tier: 50k tile loads / month.

const MAPTILER_TOKEN = (import.meta.env.VITE_MAPTILER_TOKEN as string | undefined) || "";
const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) || "";

const ESRI = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
  maxZoom: 19,
};

const MAPTILER = {
  url: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_TOKEN}`,
  attribution: "&copy; <a href=\"https://www.maptiler.com/copyright/\">MapTiler</a> &copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
  maxZoom: 22,
};

const MAPBOX = {
  url: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
  attribution: "&copy; <a href=\"https://www.mapbox.com/about/maps/\">Mapbox</a> &copy; <a href=\"https://www.openstreetmap.org/about/\">OpenStreetMap</a>",
  maxZoom: 22,
};

export function getSatelliteTile(): { url: string; attribution: string; maxZoom: number } {
  if (MAPTILER_TOKEN) return MAPTILER;
  if (MAPBOX_TOKEN) return MAPBOX;
  return ESRI;
}

export const SATELLITE_PROVIDER: "maptiler" | "mapbox" | "esri" =
  MAPTILER_TOKEN ? "maptiler" : MAPBOX_TOKEN ? "mapbox" : "esri";

