import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronRight } from "lucide-react";

// "Enter Scores" lands here. We pick the relevant matchup for this user
// and either auto-redirect (single matchup) or list the choices.
export default function ScoreEntry() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: weeks } = useQuery<any[]>({ queryKey: ["/api/weeks"] });
  const { data: matchups } = useQuery<any[]>({ queryKey: ["/api/matchups"] });
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: players } = useQuery<any[]>({ queryKey: ["/api/players"] });

  const teamMap = useMemo(() => {
    const m: Record<number, any> = {};
    for (const t of teams || []) m[t.id] = t;
    return m;
  }, [teams]);
  const playerMap = useMemo(() => {
    const m: Record<number, any> = {};
    for (const p of players || []) m[p.id] = p;
    return m;
  }, [players]);

  // Latest week
  const latestWeek = useMemo(() => {
    if (!weeks || weeks.length === 0) return null;
    return [...weeks].sort((a, b) => b.weekNumber - a.weekNumber)[0];
  }, [weeks]);

  // Matchups the current user can enter for in the latest week.
  const myMatchups = useMemo(() => {
    if (!user || !matchups || !latestWeek) return [];
    const wk = matchups.filter((m) => m.weekId === latestWeek.id);
    if (user.role === "admin") return wk;
    const pid = (user as any).playerId;
    if (!pid) return [];
    return wk.filter((m) => {
      const a = teamMap[m.teamAId];
      const b = teamMap[m.teamBId];
      return (
        (a && (a.captainId === pid || a.mateId === pid)) ||
        (b && (b.captainId === pid || b.mateId === pid))
      );
    });
  }, [user, matchups, latestWeek, teamMap]);

  // Auto-redirect if there's exactly one match (a member's own matchup)
  useEffect(() => {
    if (user && user.role !== "admin" && myMatchups.length === 1) {
      navigate(`/matchups/${myMatchups[0].id}/score`);
    }
  }, [user, myMatchups, navigate]);

  if (!user) {
    return <div className="text-sm text-muted-foreground">Please log in.</div>;
  }

  if (!latestWeek) {
    return (
      <div>
        <PageHeader title="Enter Scores" />
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <div className="text-sm">No weeks scheduled yet.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (myMatchups.length === 0) {
    return (
      <div>
        <PageHeader title="Enter Scores" description={`Week ${latestWeek.weekNumber} · ${latestWeek.date}`} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You don't have a matchup to enter scores for this week. If this looks wrong, ask the admin to check team and matchup setup.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Multiple matchups (admin or — rarely — a player on multiple teams). Pick one.
  const teamLabel = (t: any) => {
    if (!t) return "?";
    const cap = playerMap[t.captainId];
    const mate = playerMap[t.mateId];
    if (cap && mate) return `${t.name} (${cap.lastName} / ${mate.lastName})`;
    return t.name;
  };

  return (
    <div>
      <PageHeader
        title="Enter Scores"
        description={`Pick the matchup to enter scores for · Week ${latestWeek.weekNumber} · ${latestWeek.date}`}
      />
      <div className="grid gap-3 max-w-2xl">
        {myMatchups.map((m) => {
          const a = teamMap[m.teamAId];
          const b = teamMap[m.teamBId];
          return (
            <Card
              key={m.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/matchups/${m.id}/score`)}
              data-testid={`card-matchup-${m.id}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{teamLabel(a)}</div>
                  <div className="text-xs text-muted-foreground">vs</div>
                  <div className="font-semibold truncate">{teamLabel(b)}</div>
                </div>
                <Button size="sm" variant="default" data-testid={`button-enter-${m.id}`}>
                  Enter <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
