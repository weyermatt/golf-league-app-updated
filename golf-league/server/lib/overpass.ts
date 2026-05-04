// OpenStreetMap Overpass API client for fetching golf course geometry.
//
// We use Overpass to find `golf=green` ways (and optionally `golf=tee` ways)
// near a given lat/lng. This is a free, no-key API. Each request returns
// member nodes inline so we can compute polygon centroids without a second
// fetch.
//
// Coverage of municipal/local courses in the US is good but not perfect. When
// no greens are found, the caller should fall back to manual pin-drop.

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Apache in front of overpass-api.de content-negotiates 406 unless we send a
// real User-Agent and an explicit Accept header — Node's default UA gets
// rejected by some firewall rules.
const REQUEST_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "application/json",
  "User-Agent": "tnt-golf-league/1.0 (+https://github.com/weyermatt/golf-league-app-updated)",
};

export type LatLng = { lat: number; lng: number };

export type OsmGreen = {
  wayId: number;
  // Optional `ref` tag if the green is labelled with its hole number.
  ref: number | null;
  polygon: LatLng[]; // closed ring of node coords
  centroid: LatLng;
};

export type OsmTee = {
  wayId: number;
  ref: number | null;
  centroid: LatLng;
};

export type OsmGolfFeatures = {
  greens: OsmGreen[];
  tees: OsmTee[];
};

type OverpassNode = { type: "node"; id: number; lat: number; lon: number };
type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
};
type OverpassResponse = {
  elements: Array<OverpassNode | OverpassWay>;
};

function parseRef(tags: Record<string, string> | undefined): number | null {
  const r = tags?.ref;
  if (!r) return null;
  const n = parseInt(r, 10);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

function centroidOf(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  // Drop the closing duplicate point if present (Overpass returns the ring
  // with the first node repeated at the end).
  const ring = points.length > 1 &&
    points[0].lat === points[points.length - 1].lat &&
    points[0].lng === points[points.length - 1].lng
    ? points.slice(0, -1)
    : points;
  let lat = 0, lng = 0;
  for (const p of ring) { lat += p.lat; lng += p.lng; }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

/** Fetch greens + tees within `radiusMeters` of (lat,lng).
 *  Returns sets ready to upsert into `course_hole_geo`. */
export async function fetchGolfFeatures(
  lat: number,
  lng: number,
  radiusMeters: number = 1500,
): Promise<OsmGolfFeatures> {
  // Query: any way tagged golf=green or golf=tee within the radius.
  // `out body geom` returns inline node geometry so we don't need a second
  // fetch to resolve member nodes.
  const query = `
    [out:json][timeout:25];
    (
      way["golf"="green"](around:${radiusMeters},${lat},${lng});
      way["golf"="tee"](around:${radiusMeters},${lat},${lng});
    );
    out body geom;
  `.trim();

  const body = new URLSearchParams({ data: query }).toString();
  let lastErr: string | null = null;
  let data: (OverpassResponse & {
    elements: Array<OverpassWay & { geometry?: Array<{ lat: number; lon: number }> }>;
  }) | null = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: REQUEST_HEADERS,
        body,
      });
      if (!res.ok) {
        // 4xx (apart from 429 rate-limit) is the same error on every mirror;
        // fall through and let the user see it. 5xx and 429 are worth retrying
        // on the next mirror.
        const txt = await res.text().catch(() => "");
        const snippet = (txt || res.statusText).slice(0, 200);
        lastErr = `Overpass ${res.status} from ${new URL(url).host}: ${snippet}`;
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw new Error(lastErr);
        }
        continue;
      }
      data = await res.json();
      break;
    } catch (err: any) {
      // Network-level error — try the next mirror.
      lastErr = err?.message || String(err);
      if (lastErr?.startsWith("Overpass ")) throw err;
    }
  }
  if (!data) {
    throw new Error(lastErr || "Overpass: all endpoints unreachable");
  }

  const greens: OsmGreen[] = [];
  const tees: OsmTee[] = [];
  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const tag = el.tags?.golf;
    if (tag !== "green" && tag !== "tee") continue;
    const geom = el.geometry || [];
    if (geom.length === 0) continue;
    const points = geom.map(g => ({ lat: g.lat, lng: g.lon }));
    const ref = parseRef(el.tags);
    const c = centroidOf(points);
    if (tag === "green") {
      greens.push({ wayId: el.id, ref, polygon: points, centroid: c });
    } else {
      tees.push({ wayId: el.id, ref, centroid: c });
    }
  }
  return { greens, tees };
}
