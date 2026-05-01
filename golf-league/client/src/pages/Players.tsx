import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Players() {
  const { data: players } = useQuery<any[]>({ queryKey: ["/api/players"] });
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const [openId, setOpenId] = useState<number | null>(null);

  const teamFor = (pid: number) => (teams || []).find(t => t.captainId === pid || t.mateId === pid);

  return (
    <div>
      <PageHeader title="Players" description="Roster and team assignments" />

      <Card>
        <CardContent className="p-0">
          {(!players || players.length === 0) && (
            <div className="p-10 text-center text-muted-foreground text-sm">No players yet. Add players in Admin → Players.</div>
          )}
          {players && players.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-secondary-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold hidden sm:table-cell">Team</th>
                    <th className="px-4 py-3 font-semibold text-right tabular-nums">Team Hcp</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => {
                    const team = teamFor(p.id);
                    return (
                      <tr key={p.id} className="border-t border-border hover-elevate cursor-pointer" onClick={() => setOpenId(p.id)} data-testid={`row-player-${p.id}`}>
                        <td className="px-4 py-3 font-medium">{p.firstName} {p.lastName}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{team?.name || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{team?.currentHandicap != null ? team.currentHandicap.toFixed(1) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {openId != null && <PlayerDetail playerId={openId} teams={teams || []} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlayerDetail({ playerId, teams }: { playerId: number; teams: any[] }) {
  const { data: player } = useQuery<any>({ queryKey: ["/api/players", String(playerId)] });
  const team = teams.find(t => t.captainId === playerId || t.mateId === playerId);

  return (
    <div>
      <DialogHeader>
        <DialogTitle>{player ? `${player.firstName} ${player.lastName}` : "Player"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Stat label="Team" value={team?.name || "—"} />
        <Stat label="Team Handicap" value={team?.currentHandicap != null ? team.currentHandicap.toFixed(1) : "—"} />
      </div>

      <Card className="mt-5">
        <CardHeader><CardTitle className="text-sm">About Team-Only Scoring</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This league uses Captain &amp; Mate best-ball — only one team score per hole is recorded.
          Handicaps are tracked at the team level. See "My Team" or the Leaderboard for team handicap history and stats.
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-secondary/40 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
