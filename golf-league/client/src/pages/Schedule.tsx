import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatLabel } from "@/lib/featureFlags";

export default function Schedule() {
  const { data: weeks } = useQuery<any[]>({ queryKey: ["/api/weeks"] });
  const { data: matchups } = useQuery<any[]>({ queryKey: ["/api/matchups"] });
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: courses } = useQuery<any[]>({ queryKey: ["/api/courses"] });
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const teamMap: Record<number, any> = {};
  for (const t of teams || []) teamMap[t.id] = t;
  const courseMap: Record<number, any> = {};
  for (const c of courses || []) courseMap[c.id] = c;

  function canEnter(m: any): boolean {
    if (!user) return false;
    if (user.role === "admin") return true;
    const pid = (user as any).playerId;
    if (!pid) return false;
    const a = teamMap[m.teamAId];
    const b = teamMap[m.teamBId];
    return Boolean(
      (a && (a.captainId === pid || a.mateId === pid)) ||
      (b && (b.captainId === pid || b.mateId === pid))
    );
  }

  return (
    <div>
      <PageHeader title="Schedule" description="Weekly matchups, dates, and course layout" />

      <div className="space-y-6">
        {(!weeks || weeks.length === 0) && (
          <Card><CardContent className="p-10 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <div className="text-sm">No weeks scheduled yet. Add weeks in Admin → Schedule.</div>
          </CardContent></Card>
        )}
        {weeks?.map(w => {
          const wkMatchups = (matchups || []).filter(m => m.weekId === w.id);
          const layout = courseMap[w.courseId];
          return (
            <div key={w.id} className="space-y-2" data-testid={`week-${w.id}`}>
              {/* Week heading — sits above the matchup cards as a section
                  label, no longer a clickable card itself. Matchup cards
                  carry the link to the week detail. */}
              <div className="flex items-baseline gap-2 flex-wrap px-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Week {w.weekNumber}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{w.date}</span>
                {layout && (
                  <Badge variant={layout.layout === "front" ? "default" : "secondary"} className="capitalize">
                    {layout.layout} 9
                  </Badge>
                )}
                {/* Format pill — only when this week diverges from the
                    league default. Members who only ever play match play
                    don't need a "Match Play" badge on every week. */}
                {w.format && w.format !== "team_match_play" && (
                  <Badge variant="outline" className="text-xs" data-testid={`badge-week-format-${w.id}`}>
                    {formatLabel(w.format)}
                  </Badge>
                )}
              </div>

              {wkMatchups.length === 0 && (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    No matchups set for this week yet.
                  </CardContent>
                </Card>
              )}

              {wkMatchups.map(m => {
                const a = teamMap[m.teamAId];
                const b = teamMap[m.teamBId];
                const played = m.teamAPoints != null;
                const aWon = played && m.teamAPoints > m.teamBPoints;
                const bWon = played && m.teamBPoints > m.teamAPoints;
                const enterable = canEnter(m);
                return (
                  <Link key={m.id} href={`/weeks/${w.id}`} data-testid={`matchup-${m.id}`}>
                    <Card className="hover-elevate active-elevate-2 cursor-pointer transition-colors hover:border-emerald-500/40">
                      <CardContent className="p-4 space-y-2">
                        <TeamRow team={a} points={m.teamAPoints} winner={aWon} />
                        <div className="border-t border-border" />
                        <TeamRow team={b} points={m.teamBPoints} winner={bWon} />
                        {enterable && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-2"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(`/matchups/${m.id}/score`);
                            }}
                            data-testid={`button-enter-scores-${m.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Enter Scores
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamRow({ team, points, winner }: {
  team: any;
  points: number | null;
  winner: boolean;
}) {
  const hcp = team?.currentHandicap ?? team?.startingHandicap ?? null;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${winner ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
          {team?.name || "?"}
        </div>
        {hcp != null && (
          <div className="text-xs text-muted-foreground tabular-nums">
            Hcp {Number(hcp).toFixed(1)}
          </div>
        )}
      </div>
      {points != null && (
        <div className={`text-2xl font-bold tabular-nums shrink-0 ${winner ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {points}
        </div>
      )}
    </div>
  );
}
