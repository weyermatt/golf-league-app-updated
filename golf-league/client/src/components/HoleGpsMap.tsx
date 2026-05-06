import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
// Side-effect import: extends L.Map.prototype with setBearing/getBearing and
// adds rotation-aware fitBounds. Must run before MapContainer mounts.
import "leaflet-rotate";
import type { LatLng } from "@/lib/geo";
import { distMeters, metersToYards, distancesToGreen } from "@/lib/geo";
import { Crosshair, Locate, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { getSatelliteTile } from "@/lib/mapTiles";

type HoleGeo = {
  green: { lat: number | null; lng: number | null; polygon: LatLng[] | null } | null;
  tee: { lat: number; lng: number } | null;
};

type Props = {
  hole: HoleGeo | null;
  height?: number;
  // Optional hole-pager wiring: when both callbacks are provided, on-map
  // chevrons appear so the user can change holes without scrolling out of
  // the GPS view.
  holeNumber?: number;
  onPrevHole?: () => void;
  onNextHole?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
};

const TILE = getSatelliteTile();

/** Initial bearing from a → b, in degrees clockwise from true north. */
function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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
  html: `<div style="width:28px;height:28px;border-radius:9999px;border:3px solid #fff;background:rgba(255,255,255,0.15);box-shadow:0 0 0 2px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;cursor:grab;"><div style="width:6px;height:6px;border-radius:9999px;background:#fff;"></div></div>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Imperative fit/rotate handler. Runs whenever fitNonce ticks — parent bumps
// it on mount, hole change, or "Fit hole" press.
function FitAndRotate({
  tee, green, player, fitNonce,
}: {
  tee: LatLng | null;
  green: LatLng | null;
  player: LatLng | null;
  fitNonce: number;
}) {
  const map = useMap() as any;
  useEffect(() => {
    if (!green) return;
    // setBearing(360 - β) puts the tee→green vector at the top of the screen.
    // Verified empirically — tee at bottom, green at top, fairway vertical.
    const β = tee ? bearingDeg(tee, green) : 0;
    const targetBearing = tee ? (360 - β) % 360 : 0;
    if (typeof map.setBearing === "function") {
      map.setBearing(targetBearing);
    }
    const points: LatLng[] = [];
    if (tee) points.push(tee);
    if (green) points.push(green);
    if (player) points.push(player);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 17);
      return;
    }
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    // Generous bottom padding so the tee sits low in frame and the green
    // sits high — the layout players expect from a rangefinder.
    map.fitBounds(bounds, { padding: [60, 40], maxZoom: 18 });
  }, [fitNonce, map]);
  return null;
}

export function HoleGpsMap({
  hole, height = 320, holeNumber, onPrevHole, onNextHole, canPrev, canNext,
}: Props) {
  const [player, setPlayer] = useState<LatLng | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [aim, setAim] = useState<LatLng | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const mapRef = useRef<L.Map | null>(null);

  const greenLatLng: LatLng | null = hole?.green && hole.green.lat != null && hole.green.lng != null
    ? { lat: hole.green.lat, lng: hole.green.lng } : null;
  const polygon: LatLng[] | null = hole?.green?.polygon ?? null;
  const teeLatLng: LatLng | null = hole?.tee ?? null;

  const dists = useMemo(() => {
    if (!player || !greenLatLng) return { front: null, center: null, back: null };
    return distancesToGreen(player, polygon, greenLatLng);
  }, [player, polygon, greenLatLng]);

  const aimDists = useMemo(() => {
    if (!aim || !player || !greenLatLng) return null;
    return {
      playerToAim: metersToYards(distMeters(player, aim)),
      aimToGreen: metersToYards(distMeters(aim, greenLatLng)),
    };
  }, [aim, player, greenLatLng]);

  // Re-fit whenever the hole changes (and clear any aim from the previous hole).
  useEffect(() => {
    setAim(null);
    setFitNonce(n => n + 1);
  }, [greenLatLng?.lat, greenLatLng?.lng, teeLatLng?.lat, teeLatLng?.lng]);

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

  const fitHole = () => setFitNonce(n => n + 1);

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height }}>
        <MapContainer
          ref={mapRef as any}
          center={[greenLatLng.lat, greenLatLng.lng]}
          zoom={17}
          scrollWheelZoom
          // leaflet-rotate options (not in MapContainer's typed props).
          {...({ rotate: true, bearing: 0, touchRotate: false, rotateControl: false } as any)}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer url={TILE.url} attribution={TILE.attribution} maxZoom={TILE.maxZoom} />
          {teeLatLng && (
            <Polyline
              positions={[[teeLatLng.lat, teeLatLng.lng], [greenLatLng.lat, greenLatLng.lng]]}
              pathOptions={{ color: "#fff", weight: 2.5, opacity: 0.65 }}
            />
          )}
          {polygon && polygon.length > 2 && (
            <>
              {/* Outer halo: lighter green ring around the green for contrast
                  against satellite imagery (works on any tile provider). */}
              <Polygon
                positions={polygon.map(p => [p.lat, p.lng])}
                pathOptions={{ color: "#86efac", weight: 6, opacity: 0.55, fillOpacity: 0 }}
              />
              {/* Stylized green: bright fill, crisp dark border. Shape pops
                  even on the sharper Mapbox tiles. */}
              <Polygon
                positions={polygon.map(p => [p.lat, p.lng])}
                pathOptions={{ color: "#065f46", weight: 2, fillColor: "#34d399", fillOpacity: 0.55 }}
              />
            </>
          )}
          <CircleMarker
            center={[greenLatLng.lat, greenLatLng.lng]}
            radius={5}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#065f46", fillOpacity: 1 }}
          />
          {teeLatLng && (
            <CircleMarker
              center={[teeLatLng.lat, teeLatLng.lng]}
              radius={6}
              pathOptions={{ color: "#fff", weight: 2, fillColor: "#f59e0b", fillOpacity: 1 }}
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
              <Marker
                position={[aim.lat, aim.lng]}
                icon={aimIcon}
                draggable
                eventHandlers={{
                  drag: e => {
                    const ll = (e.target as L.Marker).getLatLng();
                    setAim({ lat: ll.lat, lng: ll.lng });
                  },
                  dragend: e => {
                    const ll = (e.target as L.Marker).getLatLng();
                    setAim({ lat: ll.lat, lng: ll.lng });
                  },
                }}
              />
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
          <FitAndRotate tee={teeLatLng} green={greenLatLng} player={player} fitNonce={fitNonce} />
          <MapClickHandler onClick={pt => setAim(pt)} />
        </MapContainer>

        {/* F / C / B distance badge */}
        <div className="absolute top-2 right-2 z-[1000] pointer-events-none">
          <div className="bg-black/70 backdrop-blur text-white rounded-2xl px-3 py-2 shadow-lg text-right">
            <div className="text-[9px] tracking-widest font-semibold opacity-80">TO HOLE</div>
            <div className="text-3xl font-bold leading-none tabular-nums">
              {dists.center == null ? "—" : Math.round(dists.center)}
            </div>
            <div className="text-[9px] tracking-widest opacity-80 mb-1">YARDS</div>
            <div className="grid grid-cols-3 gap-2 text-[10px] tabular-nums opacity-95 border-t border-white/15 pt-1">
              <div className="text-center">
                <div className="opacity-70">F</div>
                <div className="font-semibold">{dists.front == null ? "—" : Math.round(dists.front)}</div>
              </div>
              <div className="text-center">
                <div className="opacity-70">C</div>
                <div className="font-semibold">{dists.center == null ? "—" : Math.round(dists.center)}</div>
              </div>
              <div className="text-center">
                <div className="opacity-70">B</div>
                <div className="font-semibold">{dists.back == null ? "—" : Math.round(dists.back)}</div>
              </div>
            </div>
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
              <Crosshair className="h-3 w-3" /> Tap map to aim · drag to adjust
            </div>
          )}
        </div>

        {/* Hole pager — shown only when wired up by parent */}
        {onPrevHole && (
          <button
            type="button"
            onClick={onPrevHole}
            disabled={!canPrev}
            className="absolute top-1/2 left-1 -translate-y-1/2 z-[1000] bg-black/55 backdrop-blur text-white rounded-full p-1.5 shadow-lg hover:bg-black/75 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous hole"
            data-testid="button-gps-prev-hole"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {onNextHole && (
          <button
            type="button"
            onClick={onNextHole}
            disabled={!canNext}
            className="absolute top-1/2 right-1 -translate-y-1/2 z-[1000] bg-black/55 backdrop-blur text-white rounded-full p-1.5 shadow-lg hover:bg-black/75 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next hole"
            data-testid="button-gps-next-hole"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Hole label (only shows if parent supplied a number, since the
            existing MatchupScore card already shows it above the map) */}
        {holeNumber != null && (onPrevHole || onNextHole) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none bg-black/55 backdrop-blur text-white text-xs font-semibold rounded-full px-3 py-1 shadow-lg">
            HOLE {holeNumber}
          </div>
        )}

        {/* Bottom controls: re-center + fit hole */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1000] flex gap-2">
          <button
            type="button"
            onClick={fitHole}
            className="bg-black/70 backdrop-blur text-white text-xs font-medium rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 hover:bg-black/80"
            data-testid="button-fit-hole"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Fit hole
          </button>
          {player && (
            <button
              type="button"
              onClick={recenter}
              className="bg-black/70 backdrop-blur text-white text-xs font-medium rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 hover:bg-black/80"
              data-testid="button-recenter"
            >
              <Locate className="h-3.5 w-3.5" /> Re-center
            </button>
          )}
        </div>
      </div>

      <GeolocationWatcher
        onPos={(p, e) => {
          if (p) { setPlayer(p); setGeoErr(null); }
          else if (e) setGeoErr(e);
        }}
      />

      {geoErr && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          {geoErr.replace(/[.\s]+$/, "")}. GPS distances will appear once your location is available.
        </div>
      )}
    </div>
  );
}
