import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export default function MyTeam() {
  const { user } = useAuth();
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: players } = useQuery<any[]>({ queryKey: ["/api/players"] });

  const myTeam = useMemo(() => {
    if (!teams || !user?.playerId) return null;
    return teams.find(t => t.captainId === user.playerId || t.mateId === user.playerId) || null;
  }, [teams, user]);
  const captain = players?.find(p => p.id === myTeam?.captainId);
  const mate = players?.find(p => p.id === myTeam?.mateId);

  const { data: history } = useQuery<any[]>({
    queryKey: myTeam?.id ? ["/api/teams", String(myTeam.id), "handicap-history"] : ["noop"],
    enabled: !!myTeam?.id,
  });

  if (!user) return <div className="text-sm text-muted-foreground">Log in to see your team.</div>;
  if (!user.playerId) {
    return (
      <div>
        <PageHeader title="My Team" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Your account isn't linked to a player profile yet. Ask the admin to link it.
        </CardContent></Card>
      </div>
    );
  }
  if (!myTeam) {
    return (
      <div>
        <PageHeader title="My Team" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          You're not on a team yet. Ask the admin to add you to one.
        </CardContent></Card>
      </div>
    );
  }

  const chartData = (history || []).map(h => ({
    week: `W${h.weekNumber}`,
    handicap: h.handicapAfter,
  }));

  return (
    <div>
      <PageHeader
        title="My Team"
        description={myTeam.name}
        actions={
          <Link href="/scores/new"><Button data-testid="button-enter-scores"><PlusCircle className="h-4 w-4 mr-2" />Enter This Week's Scores</Button></Link>
        }
      />

      <Card className="mb-6">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Team Handicap</div>
            <div className="text-2xl font-bold tabular-nums mt-1" data-testid="text-team-handicap">
              {myTeam.currentHandicap != null ? myTeam.currentHandicap.toFixed(1) : "—"}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{myTeam.name}</div>
            <div>9-hole rolling handicap</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <PlayerCard p={captain} role="Captain" highlight={user.playerId === myTeam.captainId} />
        <PlayerCard p={mate} role="Mate" highlight={user.playerId === myTeam.mateId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Team Handicap History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No handicap data yet — enter your first week's scores to start.</div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
                  />
                  <Line type="monotone" dataKey="handicap" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlayerCard({ p, role, highlight }: { p: any; role: string; highlight: boolean }) {
  return (
    <Card className={highlight ? "border-primary border-2" : ""}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{role}</div>
        <div className="font-semibold mt-1">{p ? `${p.firstName} ${p.lastName}` : "—"}</div>
      </CardContent>
    </Card>
  );
}
