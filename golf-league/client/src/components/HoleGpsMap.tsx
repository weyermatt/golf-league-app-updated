import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { LatLng } from "@/lib/geo";
import { distancesToGreen } from "@/lib/geo";

type HoleGeo = {
  green: { lat: number | null; lng: number | null; polygon: LatLng[] | null } | null;
  tee: { lat: number; lng: number } | null;
};

type Props = {
  hole: HoleGeo | null;
  height?: number;
  // When true, follow the user's location (auto-pan on first fix). Default true.
  followUser?: boolean;
};

const ESRI_SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

// FitBounds helper: re-fits the map whenever the green/tee/player set changes.
function FitToTargets({ targets }: { targets: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (targets.length === 0) return;
    if (targets.length === 1) {
      map.setView([targets[0].lat, targets[0].lng], 17);
      return;
    }
    const bounds = L.latLngBounds(targets.map(t => [t.lat, t.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
  }, [JSON.stringify(targets), map]);
  return null;
}

function GeolocationWatcher({ onPos }: { onPos: (pos: LatLng | null, err: string | null) => void }) {
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      onPos(null, "Geolocation not supported on this device.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      p => onPos({ lat: p.coords.latitude, lng: p.coords.longitude }, null),
      err => onPos(null, err.message || "Couldn't read location."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return null;
}

export function HoleGpsMap({ hole, height = 320, followUser = true }: Props) {
  const [player, setPlayer] = useState<LatLng | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const fittedRef = useRef(false);

  const greenLatLng: LatLng | null = hole?.green && hole.green.lat != null && hole.green.lng != null
    ? { lat: hole.green.lat, lng: hole.green.lng } : null;
  const polygon: LatLng[] | null = hole?.green?.polygon ?? null;

  const dists = useMemo(() => {
    if (!player || !greenLatLng) return { front: null, center: null, back: null };
    return distancesToGreen(player, polygon, greenLatLng);
  }, [player, polygon, greenLatLng]);

  // First-time fit targets — don't keep re-fitting after user pans/zooms.
  const targets = useMemo<LatLng[]>(() => {
    const t: LatLng[] = [];
    if (greenLatLng) t.push(greenLatLng);
    if (hole?.tee) t.push(hole.tee);
    if (followUser && player) t.push(player);
    return t;
  }, [greenLatLng?.lat, greenLatLng?.lng, hole?.tee?.lat, hole?.tee?.lng, followUser, !!player]);

  if (!hole) {
    return (
      <div
        className="rounded-xl bg-secondary/40 border border-border flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No GPS data for this hole.
      </div>
    );
  }
  if (!greenLatLng) {
    return (
      <div
        className="rounded-xl bg-secondary/40 border border-border flex items-center justify-center text-sm text-muted-foreground text-center px-6"
        style={{ height }}
      >
        Green coordinates haven't been mapped for this hole yet. Ask an admin to refresh GPS data on this course.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden border border-border" style={{ height }}>
        <MapContainer
          center={[greenLatLng.lat, greenLatLng.lng]}
          zoom={17}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer url={ESRI_SAT_URL} attribution={ESRI_ATTR} maxZoom={19} />
          {polygon && polygon.length > 2 && (
            <Polygon positions={polygon.map(p => [p.lat, p.lng])} pathOptions={{ color: "#10b981", weight: 2, fillOpacity: 0.35 }} />
          )}
          <CircleMarker
            center={[greenLatLng.lat, greenLatLng.lng]}
            radius={4}
            pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 1 }}
          />
          {hole.tee && (
            <CircleMarker
              center={[hole.tee.lat, hole.tee.lng]}
              radius={5}
              pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 1 }}
            >
              <Tooltip permanent={false}>Tee</Tooltip>
            </CircleMarker>
          )}
          {player && (
            <>
              <CircleMarker
                center={[player.lat, player.lng]}
                radius={8}
                pathOptions={{ color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }}
              >
                <Tooltip permanent={false}>You</Tooltip>
              </CircleMarker>
            </>
          )}
          <FitToTargets targets={targets} />
        </MapContainer>
      </div>

      <GeolocationWatcher
        onPos={(p, e) => {
          if (p) { setPlayer(p); setGeoErr(null); }
          else if (e) setGeoErr(e);
        }}
      />

      {geoErr && (
        <div className="text-xs text-amber-600 dark:text-amber-400">{geoErr} GPS distances will appear once your location is available.</div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <DistTile label="Front" yards={dists.front} />
        <DistTile label="Center" yards={dists.center} highlight />
        <DistTile label="Back" yards={dists.back} />
      </div>
    </div>
  );
}

function DistTile({ label, yards, highlight }: { label: string; yards: number | null; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "bg-primary/10 border-primary/40" : "bg-secondary/40 border-border"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">
        {yards == null ? "—" : Math.round(yards)}
      </div>
      <div className="text-[10px] text-muted-foreground">yards</div>
    </div>
  );
}
