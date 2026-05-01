import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, Crown, Medal } from "lucide-react";

interface Standing {
  teamId: number;
  teamName: string;
  captainName: string;
  mateName: string;
  teamHandicap: number;
  totalPoints: number;
  lastWeekPoints: number;
  skinsWon: number;
  skinsHoles?: number[];
  skinsMoney: number;
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function Leaderboard() {
  const [filter, setFilter] = useState<string>("all");
  const { data: weeks } = useQuery<any[]>({ queryKey: ["/api/weeks"] });
  const { data, isLoading } = useQuery<{ standings: Standing[]; lastPlayedWeekId: number | null; potPerWeek: number; currentRollover: number }>({
    queryKey: ["/api/leaderboard", filter],
    queryFn: async () => {
      const url = filter === "all" ? "/api/leaderboard" : `/api/leaderboard?week=${filter}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const nextWeekPot = data?.potPerWeek ?? 0;

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        description="Season standings ranked by total points"
        actions={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44" data-testid="select-week-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Season Total</SelectItem>
              {weeks?.map(w => (
                <SelectItem key={w.id} value={String(w.id)} data-testid={`option-week-${w.id}`}>
                  Week {w.weekNumber} — {w.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {data && (
        <Card className="mb-4">
          <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Pot per week</div>
              <div className="font-semibold tabular-nums">{money(data.potPerWeek)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Next week's pot</div>
              <div className="font-bold text-accent tabular-nums" data-testid="text-next-pot">{money(nextWeekPot)}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading...</div>}
          {!isLoading && (!data?.standings || data.standings.length === 0) && (
            <div className="p-10 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <div className="text-sm">No teams yet. Add teams in Admin to get started.</div>
            </div>
          )}
          {data?.standings && data.standings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-secondary text-secondary-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold w-12 text-center">#</th>
                    <th className="px-4 py-3 font-semibold">Team</th>
                    <th className="px-4 py-3 font-semibold text-right hidden sm:table-cell">Hcp</th>
                    <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Last Wk</th>
                    <th className="px-4 py-3 font-semibold text-right">Skins</th>
                    <th className="px-4 py-3 font-semibold text-right hidden sm:table-cell">$ Won</th>
                    <th className="px-4 py-3 font-semibold text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((s, idx) => {
                    const rank = idx + 1;
                    const podium = rank <= 3;
                    return (
                      <tr key={s.teamId} className={`border-t border-border ${podium ? "bg-accent/5" : ""}`} data-testid={`row-team-${s.teamId}`}>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs">
                            {rank === 1 && <Crown className="h-4 w-4 text-accent" />}
                            {rank === 2 && <Medal className="h-4 w-4 text-muted-foreground" />}
                            {rank === 3 && <Medal className="h-4 w-4 text-muted-foreground/70" />}
                            {rank > 3 && <span className="text-muted-foreground">{rank}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold" data-testid={`text-team-name-${s.teamId}`}>{s.teamName}</div>
                          <div className="text-xs text-muted-foreground">{s.captainName} & {s.mateName}</div>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">{s.teamHandicap.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">{s.lastWeekPoints || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {s.skinsWon > 0 ? (
                            <div className="inline-flex flex-col items-end gap-0.5">
                              <Badge variant="secondary" className="bg-accent/20 text-accent-foreground border-accent/30">{s.skinsWon}</Badge>
                              {s.skinsHoles && s.skinsHoles.length > 0 && (
                                <span className="text-[10px] text-muted-foreground tabular-nums" data-testid={`text-skins-holes-${s.teamId}`}>
                                  Hole{s.skinsHoles.length > 1 ? "s" : ""} {s.skinsHoles.join(", ")}
                                </span>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell tabular-nums" data-testid={`text-skins-money-${s.teamId}`}>
                          {s.skinsMoney > 0 ? <span className="font-semibold text-accent">{money(s.skinsMoney)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold" data-testid={`text-points-${s.teamId}`}>{s.totalPoints}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
