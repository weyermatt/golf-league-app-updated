import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Download, Wand2, MapPin, Loader2, Satellite } from "lucide-react";
import { CourseGreensManager } from "./CourseGreensManager";

type SearchHit = {
  id: number;
  club_name: string;
  course_name: string;
  location?: { city?: string | null; state?: string | null; country?: string | null };
};

type CatalogCourse = {
  id: number;
  gcaId: number;
  clubName: string;
  courseName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

type CatalogTee = {
  id: number;
  golfCourseId: number;
  gender: string;
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  totalYards: number | null;
  parTotal: number | null;
  numberOfHoles: number | null;
  holes: { holeNumber: number; par: number; yardage: number | null; handicap: number | null }[];
};

export function CatalogAdmin() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course Catalog</CardTitle>
          <CardDescription>
            Search and import courses from GolfCourseAPI. Imported courses can be applied to your league's Front 9 / Back 9 layouts in one click.
          </CardDescription>
        </CardHeader>
      </Card>
      <SearchPanel />
      <ImportedCoursesPanel />
    </div>
  );
}

function SearchPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);

  const run = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setHits(null);
    try {
      const res = await apiRequest("GET", `/api/catalog/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setHits(data.courses || []);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const importCourse = async (gcaId: number) => {
    setImportingId(gcaId);
    try {
      await apiRequest("POST", "/api/catalog/import", { gcaId });
      qc.invalidateQueries({ queryKey: ["/api/catalog/courses"] });
      toast({ title: "Course imported" });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Search GolfCourseAPI</CardTitle>
        <CardDescription>Search by course name or club name (e.g. "Pebble Beach").</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Course or club name"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") run(); }}
            className="flex-1 min-w-60"
            data-testid="input-catalog-search"
          />
          <Button onClick={run} disabled={searching || !q.trim()} data-testid="button-catalog-search">
            {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Search
          </Button>
        </div>
        {hits != null && (
          <div className="mt-4">
            {hits.length === 0 ? (
              <div className="text-sm text-muted-foreground">No matches.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr className="text-left">
                    <th className="px-2 py-2">Club / Course</th>
                    <th className="px-2 py-2">Location</th>
                    <th className="px-2 py-2 text-right w-32">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.map(h => (
                    <tr key={h.id} className="border-t border-border" data-testid={`catalog-hit-${h.id}`}>
                      <td className="px-2 py-2">
                        <div className="font-medium">{h.club_name}</div>
                        <div className="text-xs text-muted-foreground">{h.course_name}</div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground text-xs">
                        {[h.location?.city, h.location?.state, h.location?.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => importCourse(h.id)}
                          disabled={importingId === h.id}
                          data-testid={`button-import-${h.id}`}
                        >
                          {importingId === h.id
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : <Download className="h-4 w-4 mr-2" />}
                          Import
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportedCoursesPanel() {
  const { data: imported } = useQuery<CatalogCourse[]>({ queryKey: ["/api/catalog/courses"] });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Imported Courses</CardTitle>
        <CardDescription>Apply any tee to your league's Front 9 or Back 9 layout.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!imported || imported.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">No courses imported yet — use the search above.</div>
        ) : (
          <div className="divide-y divide-border">
            {imported.map(c => <ImportedCourseRow key={c.id} course={c} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportedCourseRow({ course }: { course: CatalogCourse }) {
  const [view, setView] = useState<null | "tees" | "greens">(null);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium">{course.clubName}</div>
          <div className="text-xs text-muted-foreground">{course.courseName}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3" />
            {[course.city, course.state, course.country].filter(Boolean).join(", ") || "—"}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === "tees" ? "default" : "outline"}
            onClick={() => setView(v => v === "tees" ? null : "tees")}
            data-testid={`button-toggle-tees-${course.id}`}
          >
            Tees
          </Button>
          <Button
            size="sm"
            variant={view === "greens" ? "default" : "outline"}
            onClick={() => setView(v => v === "greens" ? null : "greens")}
            data-testid={`button-toggle-greens-${course.id}`}
          >
            <Satellite className="h-4 w-4 mr-1" />
            GPS / Greens
          </Button>
        </div>
      </div>
      {view === "tees" && <CourseTeesDetail courseId={course.id} />}
      {view === "greens" && (
        <div className="mt-3">
          <CourseGreensManager course={course} />
        </div>
      )}
    </div>
  );
}

function CourseTeesDetail({ courseId }: { courseId: number }) {
  const { data, isLoading } = useQuery<CatalogCourse & { tees: CatalogTee[] }>({
    queryKey: ["/api/catalog/courses", String(courseId)],
  });
  if (isLoading) return <div className="mt-3 text-sm text-muted-foreground">Loading tees…</div>;
  if (!data) return null;
  if (!data.tees || data.tees.length === 0) {
    return <div className="mt-3 text-sm text-muted-foreground">No tee data on this course.</div>;
  }
  return (
    <div className="mt-3 space-y-3">
      {data.tees.map(t => <TeeCard key={t.id} catalogCourseId={courseId} tee={t} />)}
    </div>
  );
}

function TeeCard({ catalogCourseId, tee }: { catalogCourseId: number; tee: CatalogTee }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: layoutCourses } = useQuery<{ id: number; name: string; layout: string }[]>({
    queryKey: ["/api/courses"],
  });
  const [layoutId, setLayoutId] = useState<string>("");
  const [startHole, setStartHole] = useState<string>("1");
  const [applying, setApplying] = useState(false);

  const totalHoles = tee.holes?.length ?? 0;
  const maxStart = Math.max(1, totalHoles - 8);

  const apply = async () => {
    if (!layoutId) {
      toast({ title: "Pick a layout to apply this tee to", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      await apiRequest("POST", "/api/catalog/apply", {
        layoutCourseId: Number(layoutId),
        catalogCourseId,
        teeId: tee.id,
        startHole: Number(startHole),
      });
      qc.invalidateQueries();
      toast({ title: "Applied to layout — Course tab will reflect new pars/SI/yards." });
    } catch (err: any) {
      toast({ title: "Apply failed", description: err.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-medium text-sm capitalize">
            {tee.teeName} <span className="text-muted-foreground text-xs">({tee.gender})</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {tee.numberOfHoles ?? totalHoles} holes · Par {tee.parTotal ?? "—"} · {tee.totalYards ?? "—"} yds
            {tee.courseRating != null && tee.slopeRating != null && (
              <> · {tee.courseRating} / {tee.slopeRating}</>
            )}
          </div>
        </div>
      </div>

      {totalHoles > 0 && (
        <div className="mt-3 grid sm:grid-cols-3 gap-2 items-end">
          <div>
            <Label className="text-xs">Apply to layout</Label>
            <Select value={layoutId} onValueChange={setLayoutId}>
              <SelectTrigger className="h-9" data-testid={`select-layout-${tee.id}`}>
                <SelectValue placeholder="Choose Front 9 or Back 9" />
              </SelectTrigger>
              <SelectContent>
                {(layoutCourses || []).map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.layout === "front" ? "Front 9" : c.layout === "back" ? "Back 9" : c.layout} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Start hole (catalog)</Label>
            <Select value={startHole} onValueChange={setStartHole}>
              <SelectTrigger className="h-9" data-testid={`select-start-${tee.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxStart }, (_, i) => i + 1).map(n => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 1 ? "1 (Front 9)" : n === 10 ? "10 (Back 9)" : `${n}–${n + 8}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button
              onClick={apply}
              disabled={applying || !layoutId}
              className="w-full"
              data-testid={`button-apply-${tee.id}`}
            >
              {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Apply
            </Button>
          </div>
        </div>
      )}

      {totalHoles > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="px-2 py-1">Hole</th>
                {tee.holes.map(h => <th key={h.holeNumber} className="px-2 py-1 text-center">{h.holeNumber}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-2 py-1 text-muted-foreground">Par</td>
                {tee.holes.map(h => <td key={h.holeNumber} className="px-2 py-1 text-center">{h.par}</td>)}
              </tr>
              <tr className="border-t border-border">
                <td className="px-2 py-1 text-muted-foreground">Yds</td>
                {tee.holes.map(h => <td key={h.holeNumber} className="px-2 py-1 text-center">{h.yardage ?? "—"}</td>)}
              </tr>
              <tr className="border-t border-border">
                <td className="px-2 py-1 text-muted-foreground">HCP</td>
                {tee.holes.map(h => <td key={h.holeNumber} className="px-2 py-1 text-center">{h.handicap ?? "—"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
