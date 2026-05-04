import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { LatLng } from "@/lib/geo";
import { distMeters, metersToYards, distancesToGreen } from "@/lib/geo";
import { Crosshair, Locate, X } from "lucide-react";

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

function MapClickHandler({ onClick }: { onClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

const midpoint = (a: LatLng, b: LatLng): LatLng => ({
  lat: (a.lat + b.lat) / 2,
  lng: (a.lng + b.lng) / 2,
});

function distanceLabelIcon(yards: number) {
  return L.divIcon({
    html: `<div style="background:rgba(0,0,0,0.65);color:#fff;font-weight:700;font-size:13px;padding:2px 8px;border-radius:6px;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.6);box-shadow:0 1px 3px rgba(0,0,0,0.4);">${Math.round(yards)}</div>`,
    className: "",
    iconSize: [40, 22],
    iconAnchor: [20, 11],
  });
}

const aimIcon = L.divIcon({
  html: `<div style="width:28px;height:28px;border-radius:9999px;border:3px solid #fff;background:rgba(255,255,255,0.15);box-shadow:0 0 0 2px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:9999px;background:#fff;"></div></div>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function HoleGpsMap({ hole, height = 320, followUser = true }: Props) {
  const [player, setPlayer] = useState<LatLng | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [aim, setAim] = useState<LatLng | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const greenLatLng: LatLng | null = hole?.green && hole.green.lat != null && hole.green.lng != null
    ? { lat: hole.green.lat, lng: hole.green.lng } : null;
  const polygon: LatLng[] | null = hole?.green?.polygon ?? null;

  const dists = useMemo(() => {
    if (!player || !greenLatLng) return { front: null, center: null, back: null };
    return distancesToGreen(player, polygon, greenLatLng);
  }, [player, polygon, greenLatLng]);

  // Aim-line distances: player → aim, aim → green center, in yards.
  const aimDists = useMemo(() => {
    if (!aim || !player || !greenLatLng) return null;
    return {
      playerToAim: metersToYards(distMeters(player, aim)),
      aimToGreen: metersToYards(distMeters(aim, greenLatLng)),
    };
  }, [aim, player, greenLatLng]);

  // Clear aim when the hole changes so we don't carry a stale target across.
  useEffect(() => { setAim(null); }, [greenLatLng?.lat, greenLatLng?.lng]);

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

  const recenter = () => {
    if (!mapRef.current || !player) return;
    mapRef.current.setView([player.lat, player.lng], mapRef.current.getZoom());
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height }}>
        <MapContainer
          ref={mapRef as any}
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
            <CircleMarker
              center={[player.lat, player.lng]}
              radius={8}
              pathOptions={{ color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }}
            >
              <Tooltip permanent={false}>You</Tooltip>
            </CircleMarker>
          )}
          {aim && player && greenLatLng && (
            <>
              <Polyline
                positions={[[player.lat, player.lng], [aim.lat, aim.lng], [greenLatLng.lat, greenLatLng.lng]]}
                pathOptions={{ color: "#fff", weight: 2, opacity: 0.85, dashArray: "4 6" }}
              />
              <Marker position={[aim.lat, aim.lng]} icon={aimIcon} interactive={false} />
              {aimDists && (
                <>
                  <Marker
                    position={[midpoint(player, aim).lat, midpoint(player, aim).lng]}
                    icon={distanceLabelIcon(aimDists.playerToAim)}
                    interactive={false}
                  />
                  <Marker
                    position={[midpoint(aim, greenLatLng).lat, midpoint(aim, greenLatLng).lng]}
                    icon={distanceLabelIcon(aimDists.aimToGreen)}
                    interactive={false}
                  />
                </>
              )}
            </>
          )}
          <FitToTargets targets={targets} />
          <MapClickHandler onClick={pt => setAim(pt)} />
        </MapContainer>

        {/* Hero "TO CENTER" badge */}
        <div className="absolute top-2 right-2 z-[1000] pointer-events-none">
          <div className="bg-black/70 backdrop-blur text-white rounded-2xl px-3 py-2 shadow-lg text-right min-w-[88px]">
            <div className="text-[9px] tracking-widest font-semibold opacity-80">TO CENTER</div>
            <div className="text-3xl font-bold leading-none tabular-nums">
              {dists.center == null ? "—" : Math.round(dists.center)}
            </div>
            <div className="text-[9px] tracking-widest opacity-80">YARDS</div>
            {(dists.front != null || dists.back != null) && (
              <div className="mt-1 flex justify-end gap-2 text-[10px] tabular-nums opacity-90">
                <span>F {dists.front == null ? "—" : Math.round(dists.front)}</span>
                <span>B {dists.back == null ? "—" : Math.round(dists.back)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Aim hint / clear */}
        <div className="absolute top-2 left-2 z-[1000] flex flex-col gap-2">
          {aim ? (
            <button
              type="button"
              onClick={() => setAim(null)}
              className="pointer-events-auto bg-black/70 backdrop-blur text-white text-xs font-medium rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1 hover:bg-black/80"
              data-testid="button-clear-aim"
            >
              <X className="h-3 w-3" /> Clear aim
            </button>
          ) : (
            <div className="pointer-events-none bg-black/55 backdrop-blur text-white/90 text-[11px] rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5">
              <Crosshair className="h-3 w-3" /> Tap map to aim
            </div>
          )}
        </div>

        {/* Re-center */}
        {player && (
          <button
            type="button"
            onClick={recenter}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1000] bg-black/70 backdrop-blur text-white text-xs font-medium rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 hover:bg-black/80"
            data-testid="button-recenter"
          >
            <Locate className="h-3.5 w-3.5" /> Re-center
          </button>
        )}
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
    </div>
  );
}
