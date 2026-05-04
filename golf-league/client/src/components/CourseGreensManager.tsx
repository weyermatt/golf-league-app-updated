import { Fragment, useMemo, useState } from "react";

// React.Fragment with a key — needed when grouping multiple Leaflet layers
// in a list, since react-leaflet only accepts layer children (no <div>s).
const FragmentGroup = Fragment;
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Trash2, Link as LinkIcon } from "lucide-react";

const ESRI_SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri";

type GeoRow = {
  id: number;
  golfCourseId: number;
  holeNumber: number | null;
  greenLat: number | null;
  greenLng: number | null;
  greenPolygonJson: string | null;
  polygon: { lat: number; lng: number }[] | null;
  teeLat: number | null;
  teeLng: number | null;
  source: "osm" | "manual";
  osmWayId: number | null;
};

type GeoResponse = {
  course: { id: number; latitude: number | null; longitude: number | null; clubName: string; courseName: string };
  holes: GeoRow[];
};

const HOLE_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
  "#f43f5e", "#84cc16", "#14b8a6", "#0ea5e9", "#8b5cf6",
  "#d946ef", "#f59e0b", "#64748b",
];

function colorFor(holeNumber: number | null): string {
  if (holeNumber == null) return "#94a3b8"; // slate-400 for unassigned
  return HOLE_COLORS[(holeNumber - 1) % HOLE_COLORS.length];
}

function LinkToLayoutPanel({ catalogCourseId }: { catalogCourseId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: layouts } = useQuery<{ id: number; name: string; layout: string; catalogCourseId: number | null; startHole: number | null }[]>({
    queryKey: ["/api/courses"],
  });
  const linked = (layouts || []).filter(l => l.catalogCourseId === catalogCourseId);
  const unlinked = (layouts || []).filter(l => l.catalogCourseId !== catalogCourseId);
  const [layoutId, setLayoutId] = useState("");
  const [startHole, setStartHole] = useState("1");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!layoutId) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/catalog/link", {
        layoutCourseId: Number(layoutId),
        catalogCourseId,
        startHole: Number(startHole),
      });
      qc.invalidateQueries({ queryKey: ["/api/courses"] });
      qc.invalidateQueries({ queryKey: ["/api/weeks"] });
      toast({ title: "Layout linked" });
      setLayoutId("");
    } catch (err: any) {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <LinkIcon className="h-3.5 w-3.5" />
        Linked to league layouts
      </div>
      {linked.length === 0 ? (
        <div className="text-xs text-muted-foreground">No links yet — pick a layout below to enable GPS for that 9.</div>
      ) : (
        <ul className="text-xs space-y-1">
          {linked.map(l => (
            <li key={l.id} className="text-muted-foreground">
              <span className="font-medium text-foreground">{l.layout === "front" ? "Front 9" : l.layout === "back" ? "Back 9" : l.layout}</span>
              {" — "}{l.name}{" "}<span className="text-muted-foreground">(starts at hole {l.startHole ?? 1})</span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid sm:grid-cols-3 gap-2 items-end">
        <div>
          <Label className="text-xs">Layout to link</Label>
          <Select value={layoutId} onValueChange={setLayoutId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Pick a 9-hole layout" /></SelectTrigger>
            <SelectContent>
              {unlinked.length === 0 && <SelectItem value="none" disabled>All layouts already linked</SelectItem>}
              {unlinked.map(l => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.layout === "front" ? "Front 9" : l.layout === "back" ? "Back 9" : l.layout} — {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Start hole</Label>
          <Select value={startHole} onValueChange={setStartHole}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 (Front 9)</SelectItem>
              <SelectItem value="10">10 (Back 9)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={!layoutId || saving} className="h-9">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
          Link
        </Button>
      </div>
    </div>
  );
}

export function CourseGreensManager({ course }: { course: { id: number; latitude: number | null; longitude: number | null; clubName: string } }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery<GeoResponse>({
    queryKey: ["/api/catalog/courses", String(course.id), "geo"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/catalog/courses/${course.id}/geo`);
      return res.json();
    },
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await apiRequest("POST", `/api/catalog/courses/${course.id}/geo/refresh`);
      const result = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/catalog/courses", String(course.id), "geo"] });
      qc.invalidateQueries({ queryKey: ["/api/weeks"] });
      const msg = result.greensFound === 0
        ? "No greens found in OpenStreetMap near this course. You may need to map them manually."
        : `Found ${result.greensFound} green${result.greensFound === 1 ? "" : "s"}. ${result.autoAssigned} auto-assigned, ${result.unassigned} need manual assignment.`;
      toast({ title: "OSM refreshed", description: msg });
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const reassign = async (geoId: number, holeNumber: number | null) => {
    try {
      await apiRequest("PATCH", `/api/geo/${geoId}`, { holeNumber });
      qc.invalidateQueries({ queryKey: ["/api/catalog/courses", String(course.id), "geo"] });
      qc.invalidateQueries({ queryKey: ["/api/weeks"] });
    } catch (err: any) {
      toast({ title: "Reassign failed", description: err.message, variant: "destructive" });
    }
  };

  const removeGreen = async (geoId: number) => {
    if (!confirm("Delete this green from GPS data?")) return;
    try {
      await apiRequest("DELETE", `/api/geo/${geoId}`);
      qc.invalidateQueries({ queryKey: ["/api/catalog/courses", String(course.id), "geo"] });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const center = useMemo<[number, number] | null>(() => {
    if (course.latitude != null && course.longitude != null) {
      return [course.latitude, course.longitude];
    }
    if (data?.holes && data.holes.length > 0) {
      const first = data.holes.find(h => h.greenLat != null);
      if (first?.greenLat != null && first?.greenLng != null) {
        return [first.greenLat, first.greenLng];
      }
    }
    return null;
  }, [course.latitude, course.longitude, data]);

  const greens = data?.holes || [];
  const assignedHoles = new Set(greens.map(g => g.holeNumber).filter((n): n is number => n != null));

  return (
    <div className="space-y-3">
      <LinkToLayoutPanel catalogCourseId={course.id} />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {greens.length === 0
            ? "No GPS data yet. Click Refresh to fetch greens from OpenStreetMap."
            : `${greens.length} green${greens.length === 1 ? "" : "s"} cached · ${greens.filter(g => g.holeNumber != null).length} assigned to holes.`}
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} data-testid={`button-refresh-osm-${course.id}`}>
          {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh from OSM
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : center == null ? (
        <div className="text-sm text-muted-foreground">No course location — cannot show map.</div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-border" style={{ height: 400 }}>
          <MapContainer center={center} zoom={greens.length > 0 ? 16 : 14} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer url={ESRI_SAT_URL} attribution={ESRI_ATTR} maxZoom={19} />
            {greens.map(g => {
              if (g.greenLat == null || g.greenLng == null) return null;
              const color = colorFor(g.holeNumber);
              const polygonPts = g.polygon && g.polygon.length > 2
                ? g.polygon.map(p => [p.lat, p.lng] as [number, number])
                : null;
              return (
                <FragmentGroup key={g.id}>
                  {polygonPts && (
                    <Polygon positions={polygonPts} pathOptions={{ color, weight: 2, fillOpacity: 0.4 }}>
                      <Tooltip>{g.holeNumber != null ? `Hole ${g.holeNumber}` : "Unassigned"}</Tooltip>
                    </Polygon>
                  )}
                  <CircleMarker
                    center={[g.greenLat, g.greenLng]}
                    radius={10}
                    pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }}
                  >
                    <Tooltip permanent>{g.holeNumber != null ? String(g.holeNumber) : "?"}</Tooltip>
                  </CircleMarker>
                </FragmentGroup>
              );
            })}
          </MapContainer>
        </div>
      )}

      {greens.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2">Color</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Lat / Lng</th>
                <th className="px-3 py-2">Hole #</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {greens.map(g => (
                <tr key={g.id} className="border-t border-border" data-testid={`geo-row-${g.id}`}>
                  <td className="px-3 py-2">
                    <div className="h-4 w-4 rounded-full" style={{ background: colorFor(g.holeNumber) }} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{g.source}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                    {g.greenLat?.toFixed(5)}, {g.greenLng?.toFixed(5)}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={g.holeNumber == null ? "none" : String(g.holeNumber)}
                      onValueChange={v => reassign(g.id, v === "none" ? null : Number(v))}
                    >
                      <SelectTrigger className="h-8 w-32" data-testid={`select-hole-${g.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Unassigned —</SelectItem>
                        {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                          <SelectItem
                            key={n}
                            value={String(n)}
                            disabled={g.holeNumber !== n && assignedHoles.has(n)}
                          >
                            Hole {n}{g.holeNumber !== n && assignedHoles.has(n) ? " (taken)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => removeGreen(g.id)} data-testid={`button-delete-geo-${g.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
