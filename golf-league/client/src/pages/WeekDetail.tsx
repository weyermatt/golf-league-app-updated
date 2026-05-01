import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Coins, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface Results {
  week: any;
  course: any;
  holes: any[];
  matchups: any[];
  skins: any[];
  teamScores: Record<number, Record<number, number>>;
  payout: {
    potThisWeek: number;
    rolloverIn: number;
    availablePot: number;
    skinsAwarded: number;
    winningTeams: number;
    perTeamAmount: number;
    perSkinAmount: number;
    rolloverOut: number;
    payouts: { teamId: number; teamName: string; amount: number }[];
  } | null;
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function WeekDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, isLoading } = useQuery<Results>({ queryKey: ["/api/weeks", String(id), "results"] });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Not found.</div>;

  const { week, course, holes, matchups, skins, payout } = data;
  const sortedHoles = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);
  const totalPar = sortedHoles.reduce((s, h) => s + h.par, 0);
  const isBack = course?.layout === "back";
  const toDisplay = (n: number) => (isBack ? n + 9 : n);

  return (
    <div>
      <Link href="/schedule" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3" data-testid="link-back">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Schedule
      </Link>
      <PageHeader
        title={`Week ${week.weekNumber}`}
        description={`${week.date} · ${course?.name || ""} · ${course?.layout === "front" ? "Front 9" : "Back 9"}`}
      />

      {sortedHoles.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Course holes haven't been set up. Configure them in Admin → Course.
        </CardContent></Card>
      )}

      {/* Skins summary */}
      {sortedHoles.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Coins className="h-4 w-4 text-accent" /> Skins</CardTitle>
            {payout && (
              <div className="text-xs text-muted-foreground tabular-nums mt-1">
                Pot this week: <span className="font-semibold text-foreground">{money(payout.potThisWeek)}</span>
                {" · "}
                {payout.skinsAwarded > 0 ? (
                  <>{payout.skinsAwarded} skin{payout.skinsAwarded > 1 ? "s" : ""} won · split evenly across {payout.winningTeams} team{payout.winningTeams !== 1 ? "s" : ""} · <span className="font-semibold text-accent">{money(payout.perTeamAmount)}</span> per team</>
                ) : (
                  <span className="font-semibold text-accent">No skins won this week</span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Hole</th>
                    {sortedHoles.map(h => (
                      <th key={h.holeNumber} className="px-2 py-1 text-center font-medium w-10">{toDisplay(h.holeNumber)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-2 text-muted-foreground">Winner</td>
                    {sortedHoles.map(h => {
                      const sk = skins.find((s: any) => s.holeNumber === h.holeNumber);
                      if (!sk) return <td key={h.holeNumber} className="px-2 py-2 text-center text-muted-foreground">—</td>;
                      if (sk.teamId == null) {
                        return (
                          <td key={h.holeNumber} className="px-2 py-2 text-center">
                            <span className="text-muted-foreground">CO{sk.carryoverCount > 1 ? `×${sk.carryoverCount}` : ""}</span>
                          </td>
                        );
                      }
                      return (
                        <td key={h.holeNumber} className="px-2 py-2 text-center">
                          <Badge variant="secondary" className="bg-accent/20 text-accent-foreground border-accent/30 text-[10px] px-1.5">
                            {sk.winnerName} {sk.carryoverCount > 1 ? `+${sk.carryoverCount}` : ""}
                          </Badge>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            {payout && payout.payouts.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {payout.payouts.map(p => (
                  <div key={p.teamId} className="text-xs px-3 py-1.5 rounded-md bg-accent/10 border border-accent/30 tabular-nums" data-testid={`payout-${p.teamId}`}>
                    <span className="font-semibold">{p.teamName}</span>{" "}
                    <span className="text-accent font-semibold">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Matchups */}
      <div className="space-y-6">
        {matchups.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No matchups for this week.</CardContent></Card>}
        {matchups.map((m: any) => <MatchupCard key={m.id} m={m} holes={sortedHoles} totalPar={totalPar} toDisplay={toDisplay} />)}
      </div>
    </div>
  );
}

function MatchupCard({ m, holes, totalPar, toDisplay }: { m: any; holes: any[]; totalPar: number; toDisplay: (n: number) => number }) {
  const aWon = m.teamAPoints != null && m.teamBPoints != null && m.teamAPoints > m.teamBPoints;
  const bWon = m.teamAPoints != null && m.teamBPoints != null && m.teamBPoints > m.teamAPoints;
  const detail = m.detail;
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const pid = (user as any)?.playerId;
  const canEnter =
    user?.role === "admin" ||
    (pid != null && (m.teamA.captainId === pid || m.teamA.mateId === pid || m.teamB.captainId === pid || m.teamB.mateId === pid));

  // Build per-hole strokes received per side.
  const strokesA: Record<number, number> = detail?.strokesReceivedByA || {};
  const strokesB: Record<number, number> = detail?.strokesReceivedByB || {};
  // Map holeNumber -> hole detail
  const hd: Record<number, any> = {};
  for (const h of detail?.holes || []) hd[h.holeNumber] = h;

  const totalScore = (scores: Record<number, number>) =>
    holes.reduce((s, h) => s + (scores[h.holeNumber] ?? 0), 0);

  const renderTeamRow = (label: string, scores: Record<number, number>, strokesMap: Record<number, number>) => (
    <tr className="border-t border-border">
      <td className="px-2 py-2 text-left whitespace-nowrap font-medium">{label}</td>
      {holes.map(h => {
        const s = scores[h.holeNumber];
        const strk = strokesMap[h.holeNumber] || 0;
        return (
          <td key={h.holeNumber} className="px-1 py-2 text-center relative">
            {s != null && s > 0 ? (
              <span className="inline-flex items-center justify-center gap-0.5">
                <ScoreMark score={s} par={h.par} />
                {strk > 0 && (
                  <span className="text-[9px] text-accent leading-none" aria-label={`${strk} stroke${strk > 1 ? "s" : ""}`}>{Array.from({ length: strk }, () => "•").join("")}</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
        );
      })}
      <td className="px-2 py-2 text-right font-bold">{totalScore(scores) || "—"}</td>
    </tr>
  );

  const teamLabel = (t: any) => {
    if (!t) return "";
    const cap = t.captain ? `${t.captain.firstName} ${t.captain.lastName}` : "";
    const mate = t.mate ? `${t.mate.firstName} ${t.mate.lastName}` : "";
    if (cap && mate) return `${t.name} (${cap} & ${mate})`;
    return t.name;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <CardTitle className="text-base min-w-0 break-words">
            <span className={aWon ? "font-bold" : ""}>{m.teamA.name}</span>
            <span className="text-muted-foreground mx-2">vs</span>
            <span className={bWon ? "font-bold" : ""}>{m.teamB.name}</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {m.teamAPoints != null && (
              <>
                <Badge variant={aWon ? "default" : "secondary"} className="tabular-nums" data-testid={`badge-points-a-${m.id}`}>{m.teamA.name}: {m.teamAPoints}</Badge>
                <Badge variant={bWon ? "default" : "secondary"} className="tabular-nums" data-testid={`badge-points-b-${m.id}`}>{m.teamB.name}: {m.teamBPoints}</Badge>
              </>
            )}
            {canEnter && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs shrink-0"
                onClick={() => navigate(`/matchups/${m.id}/score`)}
                data-testid={`button-enter-scores-${m.id}`}
              >
                <Pencil className="h-3 w-3 mr-1" /> Enter scores
              </Button>
            )}
          </div>
        </div>
        {detail && (
          <div className="text-xs text-muted-foreground tabular-nums">
            Team Hcps: {m.teamA.name} {detail.teamAHandicap.toFixed(1)} · {m.teamB.name} {detail.teamBHandicap.toFixed(1)}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums border-separate border-spacing-0">
            <thead>
              <tr className="text-muted-foreground bg-secondary/30">
                <th className="px-2 py-2 text-left font-medium">Hole</th>
                {holes.map(h => <th key={h.holeNumber} className="px-2 py-2 text-center font-medium w-10">{toDisplay(h.holeNumber)}</th>)}
                <th className="px-2 py-2 text-right font-medium">Tot</th>
              </tr>
              <tr className="text-muted-foreground">
                <td className="px-2 py-1 text-left">Par</td>
                {holes.map(h => <td key={h.holeNumber} className="px-2 py-1 text-center">{h.par}</td>)}
                <td className="px-2 py-1 text-right">{totalPar}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="px-2 py-1 text-left">Hcp</td>
                {holes.map(h => <td key={h.holeNumber} className="px-2 py-1 text-center">{h.strokeIndex}</td>)}
                <td></td>
              </tr>
            </thead>
            <tbody>
              {/* Team A — single best-ball row */}
              {renderTeamRow(teamLabel(m.teamA), m.teamA.scores, strokesA)}
              {/* Team B — single best-ball row */}
              {renderTeamRow(teamLabel(m.teamB), m.teamB.scores, strokesB)}
              {/* Per-hole points */}
              {detail && (
                <tr className="border-t-2 border-border bg-secondary/40">
                  <td className="px-2 py-2 text-left font-semibold">Pts ({m.teamA.name}/{m.teamB.name})</td>
                  {holes.map(h => {
                    const r = hd[h.holeNumber];
                    return (
                      <td key={h.holeNumber} className="px-2 py-2 text-center">
                        {r ? <span className="font-semibold">{r.aPoints}/{r.bPoints}</span> : "—"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right font-bold">{detail.teamAHolePoints}/{detail.teamBHolePoints}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-5 h-5">
              <span className="w-5 h-5 rounded-full border-2 border-current" />
            </span>
            <span>Birdie</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-5 h-5 relative">
              <span className="w-5 h-5 rounded-full border-2 border-current" />
              <span className="absolute inset-0.5 rounded-full border-2 border-current" />
            </span>
            <span>Eagle</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-5 h-5">
              <span className="w-5 h-5 border-2 border-current" />
            </span>
            <span>Bogey</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-5 h-5 relative">
              <span className="w-5 h-5 border-2 border-current" />
              <span className="absolute inset-0.5 border-2 border-current" />
            </span>
            <span>Double+</span>
          </span>
          <span>• = handicap stroke received</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Visual scoring marks based on raw score vs par.
//   Eagle (-2 or better) = double circle
//   Birdie (-1)          = circle
//   Par                  = no marker (plain number)
//   Bogey (+1)           = square
//   Double+ (+2 or worse) = double square
function ScoreMark({ score, par }: { score: number; par: number }) {
  const diff = score - par;
  let shape: "double-circle" | "circle" | "square" | "double-square" | null = null;
  if (diff <= -2) shape = "double-circle";
  else if (diff === -1) shape = "circle";
  else if (diff === 1) shape = "square";
  else if (diff >= 2) shape = "double-square";

  if (!shape) {
    return <span className="font-semibold tabular-nums">{score}</span>;
  }

  const isCircle = shape === "circle" || shape === "double-circle";
  const isDouble = shape === "double-circle" || shape === "double-square";
  const radius = isCircle ? "rounded-full" : "rounded-none";

  return (
    <span className="relative inline-flex items-center justify-center w-7 h-7 font-semibold tabular-nums">
      <span className={`absolute inset-0 ${radius} border-2 border-current`} />
      {isDouble && (
        <span className={`absolute inset-1 ${radius} border-2 border-current`} />
      )}
      <span className="relative">{score}</span>
    </span>
  );
}
