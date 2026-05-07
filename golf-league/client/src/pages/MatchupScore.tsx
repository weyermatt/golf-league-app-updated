import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  X,
  ListOrdered,
  Trophy,
  CheckCircle2,
  MapPin,
  Expand,
  Minimize2,
} from "lucide-react";
import { HoleGpsMap } from "@/components/HoleGpsMap";

type Player = { id: number; firstName: string; lastName: string };
type TeamWithDetails = {
  id: number;
  name: string;
  captainId: number;
  mateId: number;
  currentHandicap: number;
  captain?: Player;
  mate?: Player;
  handicap: number;
  scores: Record<number, number>;
  strokesByHole: Record<number, number>;
};
type Hole = { id: number; courseId: number; holeNumber: number; par: number; yards: number; strokeIndex: number };
type Details = {
  matchup: { id: number; weekId: number; teamAId: number; teamBId: number; teamAPoints: number | null; teamBPoints: number | null; teamAScratch: boolean; teamBScratch: boolean };
  week: { id: number; weekNumber: number; date: string; courseId: number };
  course: { id: number; name: string; layout: "front" | "back" };
  holes: Hole[];
  teamA: TeamWithDetails;
  teamB: TeamWithDetails;
};

function teamPlayersLabel(t?: TeamWithDetails) {
  if (!t) return "";
  const c = t.captain ? `${t.captain.lastName}` : "";
  const m = t.mate ? `${t.mate.lastName}` : "";
  if (c && m) return `${c} / ${m}`;
  return t.name;
}

function teamSubLabel(t?: TeamWithDetails) {
  if (!t) return "";
  const c = t.captain ? `${t.captain.lastName}` : "";
  const m = t.mate ? `${t.mate.lastName}` : "";
  return `${t.name} • ${c}${c && m ? " / " : ""}${m}`;
}

// Big initial-style avatar (no images) — first letter of last name
function AvatarBubble({ label, dark }: { label: string; dark?: boolean }) {
  return (
    <div
      className={`h-12 w-12 shrink-0 rounded-full flex items-center justify-center font-bold text-base ${
        dark ? "bg-zinc-700 text-zinc-200" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
      }`}
    >
      {label || "•"}
    </div>
  );
}

export default function MatchupScore() {
  const params = useParams<{ id: string }>();
  const matchupId = Number(params.id);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: details, isLoading } = useQuery<Details>({
    queryKey: ["/api/matchups", matchupId, "details"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/matchups/${matchupId}/details`);
      return res.json();
    },
  });

  // GPS data for the week's 9 holes (front/back of the catalog course). Null
  // when the layout has no catalog link or the course has no GPS data — we
  // hide the GPS toggle in that case.
  const weekId = details?.week?.id;
  const { data: geoData } = useQuery<{ holes: any[] }>({
    queryKey: ["/api/weeks", weekId, "geo"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/weeks/${weekId}/geo`);
      return res.json();
    },
    enabled: weekId != null,
  });
  const hasAnyGeo = (geoData?.holes || []).some(h => h?.green?.lat != null);
  const [showGps, setShowGps] = useState(false);
  const [gpsFullscreen, setGpsFullscreen] = useState(false);

  // Lock body scroll while fullscreen GPS is open so phone users can drag
  // freely on the map without rubber-banding the page below.
  useEffect(() => {
    if (!gpsFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [gpsFullscreen]);

  // Local mutable copies of scores so the UI updates instantly
  const [scoresA, setScoresA] = useState<Record<number, number | null>>({});
  const [scoresB, setScoresB] = useState<Record<number, number | null>>({});
  const [hole, setHole] = useState<number>(1);
  const [pickerOpen, setPickerOpen] = useState<null | "A" | "B">(null);
  const [saving, setSaving] = useState(false);

  // Hydrate from server data
  useEffect(() => {
    if (!details) return;
    const a: Record<number, number | null> = {};
    const b: Record<number, number | null> = {};
    for (let i = 1; i <= 9; i++) {
      a[i] = details.teamA.scores[i] ?? null;
      b[i] = details.teamB.scores[i] ?? null;
    }
    setScoresA(a);
    setScoresB(b);
  }, [details]);

  const sortedHoles = useMemo(() => {
    if (!details) return [] as Hole[];
    return [...details.holes].sort((x, y) => x.holeNumber - y.holeNumber);
  }, [details]);

  const currentHole = sortedHoles.find((h) => h.holeNumber === hole);

  // Display hole number: back-9 layouts show 10–18 to the user even though
  // hole numbers are stored as 1–9 internally.
  const isBack = details?.course.layout === "back";
  const toDisplay = (n: number) => (isBack ? n + 9 : n);

  // Brief peek animation on first paint so it's obvious there's swipe content.
  const [peeked, setPeeked] = useState(false);
  useEffect(() => {
    if (!details || peeked) return;
    const t = setTimeout(() => setPeeked(true), 1100);
    return () => clearTimeout(t);
  }, [details, peeked]);

  const canEdit = useMemo(() => {
    if (!user || !details) return false;
    if (user.role === "admin") return true;
    const pid = (user as any).playerId;
    if (!pid) return false;
    const a = details.teamA;
    const b = details.teamB;
    return (
      a.captainId === pid || a.mateId === pid || b.captainId === pid || b.mateId === pid
    );
  }, [user, details]);

  const totals = useMemo(() => {
    const sum = (m: Record<number, number | null>) =>
      Object.values(m).reduce((s: number, v) => s + (v ?? 0), 0);
    return { a: sum(scoresA), b: sum(scoresB) };
  }, [scoresA, scoresB]);

  const filledA = useMemo(() => Object.values(scoresA).filter((v) => v != null).length, [scoresA]);
  const filledB = useMemo(() => Object.values(scoresB).filter((v) => v != null).length, [scoresB]);

  async function persist(nextA: Record<number, number | null>, nextB: Record<number, number | null>) {
    setSaving(true);
    try {
      const teamA: (number | null)[] = [];
      const teamB: (number | null)[] = [];
      for (let i = 1; i <= 9; i++) {
        teamA.push(nextA[i] ?? null);
        teamB.push(nextB[i] ?? null);
      }
      await apiRequest("POST", `/api/matchups/${matchupId}/scores`, { teamA, teamB });
      // Invalidate dependent queries so leaderboard, schedule, week detail all refresh
      qc.invalidateQueries({ queryKey: ["/api/matchups", matchupId, "details"] });
      qc.invalidateQueries({ queryKey: ["/api/weeks"] });
      qc.invalidateQueries({ queryKey: ["/api/matchups"] });
      qc.invalidateQueries({ queryKey: ["/api/leaderboard"] });
      qc.invalidateQueries({ queryKey: ["/api/team-scores"] });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save score",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleScratch(side: "A" | "B", value: boolean) {
    try {
      const body = side === "A" ? { teamAScratch: value } : { teamBScratch: value };
      await apiRequest("PATCH", `/api/matchups/${matchupId}/scratch`, body);
      qc.invalidateQueries({ queryKey: ["/api/matchups", matchupId, "details"] });
      qc.invalidateQueries({ queryKey: ["/api/weeks"] });
      qc.invalidateQueries({ queryKey: ["/api/matchups"] });
      qc.invalidateQueries({ queryKey: ["/api/leaderboard"] });
      qc.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({
        title: value ? "Sub mode on" : "Sub mode off",
        description: value
          ? "This team plays raw — round excluded from season handicap."
          : "Handicap restored — round counts toward season handicap.",
      });
    } catch (e: any) {
      toast({
        title: "Could not update",
        description: e?.message || "Toggle failed",
        variant: "destructive",
      });
    }
  }

  function setScore(side: "A" | "B", strokes: number | null) {
    if (!canEdit) {
      toast({ title: "Not allowed", description: "Only players in this matchup (or an admin) can enter scores." });
      return;
    }
    const nextA = { ...scoresA };
    const nextB = { ...scoresB };
    if (side === "A") nextA[hole] = strokes;
    else nextB[hole] = strokes;
    setScoresA(nextA);
    setScoresB(nextB);
    setPickerOpen(null);
    persist(nextA, nextB);
  }

  if (isLoading || !details) {
    return (
      <div className="text-sm text-muted-foreground">Loading matchup…</div>
    );
  }

  const a = details.teamA;
  const b = details.teamB;
  const strokeA = a.strokesByHole?.[hole] ?? 0;
  const strokeB = b.strokesByHole?.[hole] ?? 0;
  const par = currentHole?.par ?? "";
  const yards = currentHole?.yards ?? "";
  const aScore = scoresA[hole];
  const bScore = scoresB[hole];

  return (
    <div className="-mx-4 -my-2 sm:mx-0 sm:my-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-0">
        <Link
          href={`/weeks/${details.week.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          data-testid="link-back-week"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
        <div className="text-sm font-semibold tabular-nums" data-testid="text-hole-label">
          Hole {toDisplay(hole)}
        </div>
        <button
          onClick={() => navigate(`/weeks/${details.week.id}`)}
          className="h-8 w-8 rounded-full bg-emerald-500/90 text-white flex items-center justify-center hover-elevate"
          data-testid="button-close"
          aria-label="Close score entry"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 sm:px-0 space-y-4 max-w-xl mx-auto pb-24">
        {/* Hole / Par / Yards card */}
        <div className="rounded-2xl bg-card border border-border px-5 py-4 flex items-end gap-6">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Hole</div>
            <div className="text-3xl font-bold tabular-nums" data-testid="text-hole-number">{toDisplay(hole)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Par</div>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-hole-par">{par}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Yards</div>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-hole-yards">{yards}</div>
          </div>
          {hasAnyGeo && (
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowGps(s => !s)}
                className={`h-10 px-3 rounded-md border text-xs font-medium flex items-center gap-1 ${
                  showGps
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-foreground border-border hover-elevate"
                }`}
                data-testid="button-toggle-gps"
                aria-pressed={showGps}
              >
                <MapPin className="h-4 w-4" />
                GPS
              </button>
              <button
                type="button"
                onClick={() => setGpsFullscreen(true)}
                className="h-7 px-2 rounded-md border border-border bg-card text-[10px] font-medium flex items-center gap-1 hover-elevate"
                data-testid="button-open-gps-fullscreen"
                title="Open GPS in fullscreen"
              >
                <Expand className="h-3 w-3" />
                Fullscreen
              </button>
            </div>
          )}
        </div>

        {showGps && hasAnyGeo && (
          <HoleGpsMap
            hole={geoData?.holes?.[hole - 1] ?? null}
            height={320}
            holeNumber={toDisplay(hole)}
            onPrevHole={() => setHole(h => Math.max(1, h - 1))}
            onNextHole={() => setHole(h => Math.min(9, h + 1))}
            canPrev={hole > 1}
            canNext={hole < 9}
            onFullscreen={() => setGpsFullscreen(true)}
          />
        )}

        {/* Two team tiles — wrapped in a hole-pager affordance with chevrons
            and a brief peek animation on first paint to telegraph swipeability. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setHole((h) => Math.max(1, h - 1))}
            disabled={hole === 1}
            aria-label="Previous hole"
            className={`absolute -left-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-foreground hover-elevate active-elevate-2 disabled:opacity-30 disabled:pointer-events-none`}
            data-testid="button-prev-hole-edge"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setHole((h) => Math.min(9, h + 1))}
            disabled={hole === 9}
            aria-label="Next hole"
            className={`absolute -right-1 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-foreground hover-elevate active-elevate-2 disabled:opacity-30 disabled:pointer-events-none`}
            data-testid="button-next-hole-edge"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div
            className={`rounded-2xl bg-card border border-border p-3 space-y-3 mx-7 transition-transform duration-500 ease-out ${peeked ? "" : "-translate-x-2"}`}
          >
            <TeamTile
              initial={(a.captain?.lastName?.[0] || a.name[0] || "•").toUpperCase()}
              title={teamPlayersLabel(a)}
              sub={teamSubLabel(a)}
              handicap={a.handicap}
              scratch={!!details.matchup.teamAScratch}
              score={aScore ?? null}
              stroke={strokeA}
              onTap={() => setPickerOpen("A")}
              testId="tile-team-a"
            />
            <TeamTile
              initial={(b.captain?.lastName?.[0] || b.name[0] || "•").toUpperCase()}
              title={teamPlayersLabel(b)}
              sub={teamSubLabel(b)}
              handicap={b.handicap}
              scratch={!!details.matchup.teamBScratch}
              score={bScore ?? null}
              stroke={strokeB}
              onTap={() => setPickerOpen("B")}
              testId="tile-team-b"
            />
          </div>
          <div className="text-[10px] text-center text-muted-foreground mt-1.5">
            Swipe or tap arrows to change holes
          </div>
        </div>

        {/* Admin-only: per-team "sub played" toggle. When on, that team plays
            no-handicap for this matchup AND the round is excluded from their
            season handicap. */}
        {user?.role === "admin" && (
          <div className="rounded-2xl bg-card border border-border px-4 py-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Sub played — no handicap (admin)
            </div>
            <ScratchToggle
              label={teamPlayersLabel(a) || a.name}
              checked={!!details.matchup.teamAScratch}
              onChange={(v) => toggleScratch("A", v)}
              testId="toggle-scratch-a"
            />
            <ScratchToggle
              label={teamPlayersLabel(b) || b.name}
              checked={!!details.matchup.teamBScratch}
              onChange={(v) => toggleScratch("B", v)}
              testId="toggle-scratch-b"
            />
          </div>
        )}

        {/* Pager: arrows + dots */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHole((h) => Math.max(1, h - 1))}
            disabled={hole === 1}
            data-testid="button-prev-hole"
            aria-label="Previous hole"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {sortedHoles.map((h) => {
              const filled = (scoresA[h.holeNumber] ?? 0) > 0 || (scoresB[h.holeNumber] ?? 0) > 0;
              const isCurrent = h.holeNumber === hole;
              return (
                <button
                  key={h.holeNumber}
                  onClick={() => setHole(h.holeNumber)}
                  className={`h-2.5 w-2.5 rounded-full transition-all ${
                    isCurrent
                      ? "bg-emerald-500 w-6"
                      : filled
                      ? "bg-emerald-500/60"
                      : "bg-muted"
                  }`}
                  data-testid={`dot-hole-${h.holeNumber}`}
                  aria-label={`Go to hole ${toDisplay(h.holeNumber)}`}
                />
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHole((h) => Math.min(9, h + 1))}
            disabled={hole === 9}
            data-testid="button-next-hole"
            aria-label="Next hole"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Running totals */}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Running totals</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-secondary/40 p-3">
                <div className="text-xs text-muted-foreground truncate">{teamPlayersLabel(a)}</div>
                <div className="flex items-baseline gap-2">
                  <div className="text-xl font-bold tabular-nums" data-testid="text-total-a">{totals.a || "—"}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{filledA}/9 holes</div>
                </div>
              </div>
              <div className="rounded-md bg-secondary/40 p-3">
                <div className="text-xs text-muted-foreground truncate">{teamPlayersLabel(b)}</div>
                <div className="flex items-baseline gap-2">
                  <div className="text-xl font-bold tabular-nums" data-testid="text-total-b">{totals.b || "—"}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{filledB}/9 holes</div>
                </div>
              </div>
            </div>
            {saving && <div className="text-[10px] text-muted-foreground mt-2">Saving…</div>}
          </CardContent>
        </Card>

        {/* Finish round — surfaces on hole 9 once both teams have all 9 scores in.
            Scores already auto-saved on every entry; this is a confirmation step
            that gives players a clear "done" moment and routes them back to the
            week scorecard. */}
        {hole === 9 && filledA === 9 && filledB === 9 && (
          <Button
            size="lg"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base font-semibold"
            onClick={() => {
              toast({
                title: "Round complete",
                description: `Final — ${teamPlayersLabel(a)}: ${totals.a} · ${teamPlayersLabel(b)}: ${totals.b}. Scores saved.`,
              });
              navigate(`/weeks/${details.week.id}`);
            }}
            data-testid="button-finish-round"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" /> Finish round
          </Button>
        )}
        {hole === 9 && (filledA < 9 || filledB < 9) && (
          <div className="text-center text-xs text-muted-foreground rounded-md bg-secondary/40 py-2 px-3">
            Enter all 9 holes for both teams to finish the round.
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/weeks/${details.week.id}`)}
            data-testid="button-scorecard"
          >
            <ListOrdered className="h-4 w-4 mr-1" /> Scorecard
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/leaderboard")}
            data-testid="button-leaderboard"
          >
            <Trophy className="h-4 w-4 mr-1" /> Leaderboard
          </Button>
        </div>

        {!canEdit && (
          <div className="text-xs text-muted-foreground text-center">
            View only — score entry is restricted to players in this matchup or an admin.
          </div>
        )}
      </div>

      {/* Fullscreen GPS overlay. The picker Dialog below portals to body, so
          it appears above this overlay even though the markup nests after it. */}
      {gpsFullscreen && hasAnyGeo && (
        <div className="fixed inset-0 z-40 bg-black flex flex-col" data-testid="gps-fullscreen">
          <div className="flex-shrink-0 px-3 py-2 flex items-center justify-between bg-black/85 backdrop-blur text-white">
            <div className="text-sm font-semibold tabular-nums">
              Hole {toDisplay(hole)} · Par {par}{yards ? ` · ${yards} yds` : ""}
            </div>
            <button
              type="button"
              onClick={() => setGpsFullscreen(false)}
              className="h-8 px-3 rounded-full bg-white/15 hover:bg-white/25 text-xs font-medium flex items-center gap-1.5"
              data-testid="button-exit-gps-fullscreen"
            >
              <Minimize2 className="h-3.5 w-3.5" /> Exit
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <HoleGpsMap
              hole={geoData?.holes?.[hole - 1] ?? null}
              height="100%"
              holeNumber={toDisplay(hole)}
              onPrevHole={() => setHole(h => Math.max(1, h - 1))}
              onNextHole={() => setHole(h => Math.min(9, h + 1))}
              canPrev={hole > 1}
              canNext={hole < 9}
            />
          </div>
          <div className="flex-shrink-0 p-2 space-y-2 bg-black/85 backdrop-blur">
            <FullscreenScoreTile
              initial={(a.captain?.lastName?.[0] || a.name[0] || "•").toUpperCase()}
              title={teamPlayersLabel(a)}
              sub={teamSubLabel(a)}
              handicap={a.handicap}
              scratch={!!details.matchup.teamAScratch}
              score={aScore ?? null}
              stroke={strokeA}
              onTap={() => canEdit && setPickerOpen("A")}
              disabled={!canEdit}
              testId="fullscreen-tile-a"
            />
            <FullscreenScoreTile
              initial={(b.captain?.lastName?.[0] || b.name[0] || "•").toUpperCase()}
              title={teamPlayersLabel(b)}
              sub={teamSubLabel(b)}
              handicap={b.handicap}
              scratch={!!details.matchup.teamBScratch}
              score={bScore ?? null}
              stroke={strokeB}
              onTap={() => canEdit && setPickerOpen("B")}
              disabled={!canEdit}
              testId="fullscreen-tile-b"
            />
          </div>
        </div>
      )}

      {/* Number picker dialog */}
      <Dialog open={pickerOpen !== null} onOpenChange={(o) => !o && setPickerOpen(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              Hole {toDisplay(hole)} — Par {par}
              <div className="text-xs font-normal text-muted-foreground mt-1">
                {pickerOpen === "A" ? teamPlayersLabel(a) : teamPlayersLabel(b)}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 pt-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
              const isPar = n === par;
              return (
                <button
                  key={n}
                  onClick={() => pickerOpen && setScore(pickerOpen, n)}
                  className={`h-12 rounded-md border font-bold tabular-nums hover-elevate ${
                    isPar ? "border-emerald-500/60 bg-emerald-500/10" : "border-border bg-card"
                  }`}
                  data-testid={`button-score-${n}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => pickerOpen && setScore(pickerOpen, null)}
            className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground py-2"
            data-testid="button-clear-score"
          >
            Clear score for this hole
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FullscreenScoreTile({
  initial, title, sub, handicap, scratch, score, stroke, onTap, disabled, testId,
}: {
  initial: string;
  title: string;
  sub: string;
  handicap: number;
  scratch?: boolean;
  score: number | null;
  stroke: number;
  onTap: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-white/8 border border-white/15 p-2.5 flex items-center gap-3 ${disabled ? "opacity-60" : ""}`}
      style={{ background: "rgba(255,255,255,0.08)" }}
      data-testid={testId}
    >
      <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center font-bold text-base">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white truncate text-sm">{title}</div>
        <div className="text-[11px] text-white/60 truncate">{sub}</div>
        <div className="text-[11px] text-white/70 tabular-nums flex items-center gap-1.5">
          {scratch ? (
            <>
              <span className="line-through opacity-60">{handicap.toFixed(1)}</span>
              <span className="text-[9px] px-1.5 py-0 rounded border border-amber-400/40 text-amber-300">
                Sub — No Hcp
              </span>
            </>
          ) : (
            <span>{handicap.toFixed(1)} Handicap</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          type="button"
          onClick={onTap}
          disabled={disabled}
          className={`min-w-[72px] h-14 rounded-lg flex flex-col items-center justify-center font-bold leading-none transition-colors disabled:cursor-not-allowed ${
            score != null
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-sky-500 text-white hover:bg-sky-600"
          }`}
          data-testid={`${testId}-score-button`}
        >
          {score != null ? (
            <span className="text-2xl tabular-nums">{score}</span>
          ) : (
            <span className="text-[10px] px-2 text-center leading-tight">TAP TO<br/>SCORE</span>
          )}
        </button>
        {stroke > 0 && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 text-white border border-zinc-700 tabular-nums"
            data-testid={`${testId}-stroke-badge`}
          >
            -{stroke} Stroke{stroke > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function TeamTile({
  initial,
  title,
  sub,
  handicap,
  scratch,
  score,
  stroke,
  onTap,
  testId,
}: {
  initial: string;
  title: string;
  sub: string;
  handicap: number;
  scratch?: boolean;
  score: number | null;
  stroke: number;
  onTap: () => void;
  testId: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3 flex items-center gap-3" data-testid={testId}>
      <AvatarBubble label={initial} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
        <div className="text-xs text-muted-foreground tabular-nums flex items-center gap-1.5">
          {scratch ? (
            <>
              <span className="line-through opacity-60">{handicap.toFixed(1)}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
                Sub — No Handicap
              </Badge>
            </>
          ) : (
            <span>{handicap.toFixed(1)} Handicap</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={onTap}
          className={`min-w-[88px] h-16 rounded-lg flex flex-col items-center justify-center font-bold text-lg leading-none hover-elevate active-elevate-2 ${
            score != null
              ? "bg-emerald-500 text-white"
              : "bg-sky-500 text-white"
          }`}
          data-testid={`${testId}-score-button`}
        >
          {score != null ? (
            <span className="text-3xl tabular-nums" data-testid={`${testId}-score-value`}>{score}</span>
          ) : (
            <span className="text-xs px-2 text-center leading-tight">TAP TO<br/>SCORE</span>
          )}
        </button>
        {stroke > 0 && (
          <Badge
            variant="secondary"
            className="bg-zinc-900 text-white border-zinc-700 text-[10px] px-2 py-0.5"
            data-testid={`${testId}-stroke-badge`}
          >
            -{stroke} Stroke{stroke > 1 ? "s" : ""}
          </Badge>
        )}
      </div>
    </div>
  );
}

function ScratchToggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <label
      className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
      data-testid={testId}
    >
      <span className="text-sm truncate">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </label>
  );
}
