import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronRight, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";

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

      <div className="grid gap-3">
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
            <Link key={w.id} href={`/weeks/${w.id}`} data-testid={`link-week-${w.id}`}>
              <Card className="group hover-elevate active-elevate-2 cursor-pointer transition-colors hover:border-emerald-500/40">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Week {w.weekNumber}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{w.date}</span>
                        {layout && (
                          <Badge variant={layout.layout === "front" ? "default" : "secondary"} className="capitalize">
                            {layout.layout} 9
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        {wkMatchups.length === 0 && <div className="text-sm text-muted-foreground">No matchups set</div>}
                        {wkMatchups.map(m => {
                          const a = teamMap[m.teamAId];
                          const b = teamMap[m.teamBId];
                          const played = m.teamAPoints != null;
                          const enterable = canEnter(m);
                          return (
                            <div key={m.id} className="flex items-center gap-3 text-sm" data-testid={`matchup-${m.id}`}>
                              <span className={`flex-1 text-right ${played && m.teamAPoints > m.teamBPoints ? "font-semibold" : ""}`}>
                                {a?.name || "?"} {played && <span className="ml-1 text-xs tabular-nums text-muted-foreground">({m.teamAPoints})</span>}
                              </span>
                              <span className="text-xs text-muted-foreground">vs</span>
                              <span className={`flex-1 ${played && m.teamBPoints > m.teamAPoints ? "font-semibold" : ""}`}>
                                {b?.name || "?"} {played && <span className="ml-1 text-xs tabular-nums text-muted-foreground">({m.teamBPoints})</span>}
                              </span>
                              {enterable && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    navigate(`/matchups/${m.id}/score`);
                                  }}
                                  data-testid={`button-enter-scores-${m.id}`}
                                >
                                  <Pencil className="h-3 w-3 mr-1" /> Enter
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-semibold opacity-70 group-hover:opacity-100 transition-opacity">
                        View results
                      </span>
                      <ChevronRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
