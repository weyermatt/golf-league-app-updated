export type LatLng = { lat: number; lng: number };

const EARTH_R_M = 6371000;

/** Haversine distance in meters between two coords. */
export function distMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(x));
}

export const M_TO_YD = 1.09361;
export const metersToYards = (m: number) => m * M_TO_YD;

/** Given a player position and a green polygon, return distances in yards
 *  to front (closest polygon point), center (centroid), and back (farthest
 *  polygon point). Returns null fields when polygon is missing or empty. */
export function distancesToGreen(player: LatLng, polygon: LatLng[] | null, fallbackCenter: LatLng | null): {
  front: number | null; center: number | null; back: number | null;
} {
  if (!polygon || polygon.length === 0) {
    if (!fallbackCenter) return { front: null, center: null, back: null };
    const d = metersToYards(distMeters(player, fallbackCenter));
    return { front: d, center: d, back: d };
  }
  let min = Infinity, max = -Infinity;
  for (const pt of polygon) {
    const d = distMeters(player, pt);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  // Centroid
  let lat = 0, lng = 0;
  const ring = polygon.length > 1 &&
    polygon[0].lat === polygon[polygon.length - 1].lat &&
    polygon[0].lng === polygon[polygon.length - 1].lng
    ? polygon.slice(0, -1) : polygon;
  for (const p of ring) { lat += p.lat; lng += p.lng; }
  const center: LatLng = { lat: lat / ring.length, lng: lng / ring.length };
  return {
    front: metersToYards(min),
    center: metersToYards(distMeters(player, center)),
    back: metersToYards(max),
  };
}
