import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, KeyRound, Save, UserPlus } from "lucide-react";
import { CatalogAdmin } from "@/components/CatalogAdmin";
import { availableFormats, formatLabel } from "@/lib/featureFlags";

export default function Admin() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") {
    return <div className="text-sm text-muted-foreground">Admin access only.</div>;
  }
  return (
    <div>
      <PageHeader title="Admin" description="Manage players, teams, course, schedule, scoring, and more" />
      <Tabs defaultValue="players">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="players" data-testid="tab-players">Players</TabsTrigger>
          <TabsTrigger value="teams" data-testid="tab-teams">Teams</TabsTrigger>
          <TabsTrigger value="course" data-testid="tab-course">Course</TabsTrigger>
          <TabsTrigger value="catalog" data-testid="tab-catalog">Catalog</TabsTrigger>
          <TabsTrigger value="schedule" data-testid="tab-schedule">Schedule</TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">Points / Hcp</TabsTrigger>
          <TabsTrigger value="bulk" data-testid="tab-bulk">Bulk Import</TabsTrigger>
          <TabsTrigger value="override" data-testid="tab-override">Manual Override</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          <TabsContent value="players"><PlayersAdmin /></TabsContent>
          <TabsContent value="teams"><TeamsAdmin /></TabsContent>
          <TabsContent value="course"><CourseAdmin /></TabsContent>
          <TabsContent value="catalog"><CatalogAdmin /></TabsContent>
          <TabsContent value="schedule"><ScheduleAdmin /></TabsContent>
          <TabsContent value="config"><ConfigAdmin /></TabsContent>
          <TabsContent value="bulk"><BulkImportAdmin /></TabsContent>
          <TabsContent value="override"><OverrideAdmin /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ===== Players =====
function PlayersAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: players } = useQuery<any[]>({ queryKey: ["/api/players"] });
  const { data: users } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  const add = async () => {
    if (!first || !last) return;
    await apiRequest("POST", "/api/players", { firstName: first, lastName: last, active: true });
    setFirst(""); setLast("");
    qc.invalidateQueries();
    toast({ title: "Player added" });
  };
  const del = async (id: number) => {
    if (!confirm("Delete this player?")) return;
    await apiRequest("DELETE", `/api/players/${id}`);
    qc.invalidateQueries();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Add Player</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input placeholder="First name" value={first} onChange={e => setFirst(e.target.value)} className="w-44" data-testid="input-player-first" />
          <Input placeholder="Last name" value={last} onChange={e => setLast(e.target.value)} className="w-44" data-testid="input-player-last" />
          <Button onClick={add} data-testid="button-add-player"><Plus className="h-4 w-4 mr-2" />Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Players</CardTitle>
            <NewUserDialog />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr className="text-left"><th className="px-4 py-2">Name</th><th className="px-4 py-2">User Account</th><th className="px-4 py-2 text-right w-32">Actions</th></tr>
            </thead>
            <tbody>
              {(players || []).map(p => {
                const u = (users || []).find((u: any) => u.playerId === p.id);
                return (
                  <tr key={p.id} className="border-t border-border" data-testid={`admin-player-${p.id}`}>
                    <td className="px-4 py-2">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u ? u.username + " (" + u.role + ")" : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => del(p.id)} data-testid={`button-delete-player-${p.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <UsersAdmin />
    </div>
  );
}

function NewUserDialog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: players } = useQuery<any[]>({ queryKey: ["/api/players"] });
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [playerId, setPlayerId] = useState<string>("");

  const submit = async () => {
    try {
      await apiRequest("POST", "/api/users", {
        username, password, role,
        playerId: playerId ? Number(playerId) : null,
      });
      qc.invalidateQueries();
      toast({ title: "User created" });
      setOpen(false);
      setUsername(""); setPassword(""); setRole("member"); setPlayerId("");
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" data-testid="button-new-user"><UserPlus className="h-4 w-4 mr-2" />New User</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Username</Label><Input value={username} onChange={e => setUsername(e.target.value)} data-testid="input-new-username" /></div>
          <div><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-new-password" /></div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v: any) => setRole(v)}>
              <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Linked Player</Label>
            <Select value={playerId} onValueChange={setPlayerId}>
              <SelectTrigger data-testid="select-link-player"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(players || []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} data-testid="button-create-user">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UsersAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: players } = useQuery<any[]>({ queryKey: ["/api/players"] });
  const [resetId, setResetId] = useState<number | null>(null);
  const [newPw, setNewPw] = useState("");

  const reset = async () => {
    if (!resetId || !newPw) return;
    await apiRequest("POST", `/api/users/${resetId}/reset-password`, { newPassword: newPw });
    setResetId(null); setNewPw("");
    toast({ title: "Password reset" });
  };

  const updateUser = async (id: number, patch: any) => {
    await apiRequest("PATCH", `/api/users/${id}`, patch);
    qc.invalidateQueries();
  };

  const del = async (id: number) => {
    if (!confirm("Delete this user account?")) return;
    await apiRequest("DELETE", `/api/users/${id}`);
    qc.invalidateQueries();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">User Accounts</CardTitle></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr className="text-left"><th className="px-4 py-2">Username</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Linked Player</th><th className="px-4 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {(users || []).map(u => {
              const p = (players || []).find((p: any) => p.id === u.playerId);
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{u.username}</td>
                  <td className="px-4 py-2">
                    <Select value={u.role} onValueChange={v => updateUser(u.id, { role: v })}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2">
                    <Select
                      value={u.playerId ? String(u.playerId) : "none"}
                      onValueChange={v => updateUser(u.id, { playerId: v === "none" ? null : Number(v) })}
                    >
                      <SelectTrigger className="h-8 w-44"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(players || []).map(pp => <SelectItem key={pp.id} value={String(pp.id)}>{pp.firstName} {pp.lastName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setResetId(u.id)} data-testid={`button-reset-${u.id}`}><KeyRound className="h-4 w-4 mr-1" />Reset</Button>
                    <Button variant="ghost" size="icon" onClick={() => del(u.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <Dialog open={resetId != null} onOpenChange={o => !o && setResetId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} data-testid="input-reset-password" />
              <Button onClick={reset} data-testid="button-confirm-reset">Reset</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ===== Teams =====
function TeamsAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: players } = useQuery<any[]>({ queryKey: ["/api/players"] });
  const [name, setName] = useState("");
  const [capId, setCapId] = useState<string>("");
  const [mateId, setMateId] = useState<string>("");

  const add = async () => {
    if (!name || !capId || !mateId || capId === mateId) {
      toast({ title: "Pick a name and two distinct players", variant: "destructive" });
      return;
    }
    await apiRequest("POST", "/api/teams", { name, captainId: Number(capId), mateId: Number(mateId), active: true });
    setName(""); setCapId(""); setMateId("");
    qc.invalidateQueries();
    toast({ title: "Team added" });
  };

  const del = async (id: number) => {
    if (!confirm("Delete this team?")) return;
    await apiRequest("DELETE", `/api/teams/${id}`);
    qc.invalidateQueries();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Add Team</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input placeholder="Team name" value={name} onChange={e => setName(e.target.value)} className="w-48" data-testid="input-team-name" />
          <Select value={capId} onValueChange={setCapId}>
            <SelectTrigger className="w-48" data-testid="select-captain"><SelectValue placeholder="Captain" /></SelectTrigger>
            <SelectContent>{(players || []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={mateId} onValueChange={setMateId}>
            <SelectTrigger className="w-48" data-testid="select-mate"><SelectValue placeholder="Mate" /></SelectTrigger>
            <SelectContent>{(players || []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={add} data-testid="button-add-team"><Plus className="h-4 w-4 mr-2" />Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Teams</CardTitle>
          <CardDescription className="text-xs">
            <strong>Starting Hcp</strong>: returning teams — enter last year's ending handicap (used as the seed; the rolling formula adjusts from week 1).{" "}
            <strong>Hcp from Wk</strong>: for genuinely new teams, set to e.g. <code>4</code> so they play raw for weeks 1–3 and the rolling handicap begins on week 4 using just those first 3 weeks. Returning teams: leave at <code>1</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr className="text-left">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Captain</th>
                <th className="px-4 py-2">Mate</th>
                <th className="px-3 py-2 text-right tabular-nums">Starting Hcp</th>
                <th className="px-3 py-2 text-right tabular-nums">Hcp from Wk</th>
                <th className="px-4 py-2 text-right tabular-nums">Current Hcp</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(teams || []).map(t => {
                const c = (players || []).find((p: any) => p.id === t.captainId);
                const m = (players || []).find((p: any) => p.id === t.mateId);
                return (
                  <TeamRow key={t.id} t={t} captain={c} mate={m} players={players || []} onDelete={() => del(t.id)} />
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// Editable team row — captain/mate, starting handicap, handicap-start-week, with auto-recompute on save
function TeamRow({ t, captain, mate, players, onDelete }: { t: any; captain: any; mate: any; players: any[]; onDelete: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [seed, setSeed] = useState<string>(t.startingHandicap != null ? String(t.startingHandicap) : "");
  const [startWk, setStartWk] = useState<string>(String(t.handicapStartWeek ?? 1));
  const [capId, setCapId] = useState<string>(t.captainId != null ? String(t.captainId) : "");
  const [mateId, setMateId] = useState<string>(t.mateId != null ? String(t.mateId) : "");
  const [saving, setSaving] = useState(false);

  // Reset local state if backing data changes externally
  useEffect(() => {
    setSeed(t.startingHandicap != null ? String(t.startingHandicap) : "");
    setStartWk(String(t.handicapStartWeek ?? 1));
    setCapId(t.captainId != null ? String(t.captainId) : "");
    setMateId(t.mateId != null ? String(t.mateId) : "");
  }, [t.startingHandicap, t.handicapStartWeek, t.captainId, t.mateId]);

  const samePlayer = capId !== "" && mateId !== "" && capId === mateId;
  const dirty =
    (seed === "" ? null : Number(seed)) !== (t.startingHandicap ?? null) ||
    Number(startWk) !== (t.handicapStartWeek ?? 1) ||
    (capId === "" ? null : Number(capId)) !== (t.captainId ?? null) ||
    (mateId === "" ? null : Number(mateId)) !== (t.mateId ?? null);

  const save = async () => {
    if (samePlayer) {
      toast({ title: "Invalid team", description: "Captain and mate must be different players.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const patch: any = {
        startingHandicap: seed === "" ? null : Number(seed),
        handicapStartWeek: Math.max(1, Number(startWk) || 1),
      };
      if (capId !== "") patch.captainId = Number(capId);
      if (mateId !== "") patch.mateId = Number(mateId);
      await apiRequest("PATCH", `/api/teams/${t.id}`, patch);
      // Trigger a full recompute so existing weeks pick up any seed/start changes.
      await apiRequest("POST", "/api/admin/recompute", {});
      qc.invalidateQueries();
      toast({ title: "Saved", description: "Team updated and recomputed." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Sort players for stable dropdowns
  const sortedPlayers = [...players].sort((a, b) => {
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  return (
    <tr className="border-t border-border" data-testid={`admin-team-${t.id}`}>
      <td className="px-4 py-2 font-medium">{t.name}</td>
      <td className="px-4 py-2">
        <Select value={capId} onValueChange={setCapId}>
          <SelectTrigger className="h-8 w-44" data-testid={`select-captain-${t.id}`}><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {sortedPlayers.map((p: any) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-2">
        <Select value={mateId} onValueChange={setMateId}>
          <SelectTrigger className={`h-8 w-44 ${samePlayer ? "border-destructive" : ""}`} data-testid={`select-mate-${t.id}`}><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {sortedPlayers.map((p: any) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.firstName} {p.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          step="0.1"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="—"
          className="h-8 w-20 text-right tabular-nums ml-auto"
          data-testid={`input-starting-hcp-${t.id}`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          min={1}
          step={1}
          value={startWk}
          onChange={(e) => setStartWk(e.target.value)}
          className="h-8 w-16 text-right tabular-nums ml-auto"
          data-testid={`input-start-week-${t.id}`}
        />
      </td>
      <td className="px-4 py-2 text-right tabular-nums" data-testid={`text-team-hcp-${t.id}`}>
        {t.currentHandicap != null ? Number(t.currentHandicap).toFixed(1) : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={!dirty || saving}
            onClick={save}
            data-testid={`button-save-team-${t.id}`}
          >
            <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-team-${t.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ===== Course =====
function CourseAdmin() {
  const { data: courses } = useQuery<any[]>({ queryKey: ["/api/courses"] });
  return (
    <div className="space-y-4">
      {(courses || []).map(c => <CourseLayoutCard key={c.id} course={c} />)}
    </div>
  );
}

function CourseLayoutCard({ course }: { course: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: holes } = useQuery<any[]>({ queryKey: ["/api/courses", String(course.id), "holes"] });
  const [name, setName] = useState(course.name);
  const [rating, setRating] = useState<string>(course.courseRating?.toString() ?? "");
  const [slope, setSlope] = useState<string>(course.slope?.toString() ?? "");
  const [rows, setRows] = useState<{ holeNumber: number; par: number; strokeIndex: number; yards: number | null }[]>([]);

  useEffect(() => {
    setName(course.name);
    setRating(course.courseRating?.toString() ?? "");
    setSlope(course.slope?.toString() ?? "");
  }, [course]);

  useEffect(() => {
    const arr: any[] = [];
    for (let i = 1; i <= 9; i++) {
      const h = (holes || []).find((x: any) => x.holeNumber === i);
      arr.push({
        holeNumber: i,
        par: h?.par ?? 4,
        strokeIndex: h?.strokeIndex ?? i,
        yards: h?.yards ?? null,
      });
    }
    setRows(arr);
  }, [holes]);

  const updateRow = (i: number, patch: any) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const loadEriePreset = () => {
    // The Links at Erie Village (White tees). Stroke indexes are within-9 (1=hardest),
    // re-ranked from the official 18-hole handicap allocation.
    // Sources: GolfPass / 18Birdies scorecard.
    if (course.layout === "front") {
      setName("The Links at Erie Village (White) — Front");
      setRating("35.0");
      setSlope("126");
      setRows([
        { holeNumber: 1, par: 4, strokeIndex: 5, yards: 366 },
        { holeNumber: 2, par: 5, strokeIndex: 1, yards: 511 },
        { holeNumber: 3, par: 4, strokeIndex: 8, yards: 332 },
        { holeNumber: 4, par: 4, strokeIndex: 3, yards: 344 },
        { holeNumber: 5, par: 4, strokeIndex: 2, yards: 406 },
        { holeNumber: 6, par: 3, strokeIndex: 9, yards: 166 },
        { holeNumber: 7, par: 5, strokeIndex: 4, yards: 464 },
        { holeNumber: 8, par: 4, strokeIndex: 6, yards: 347 },
        { holeNumber: 9, par: 3, strokeIndex: 7, yards: 174 },
      ]);
    } else {
      setName("The Links at Erie Village (White) — Back");
      setRating("35.1");
      setSlope("126");
      setRows([
        { holeNumber: 1, par: 4, strokeIndex: 1, yards: 375 },
        { holeNumber: 2, par: 4, strokeIndex: 5, yards: 391 },
        { holeNumber: 3, par: 4, strokeIndex: 6, yards: 319 },
        { holeNumber: 4, par: 3, strokeIndex: 9, yards: 150 },
        { holeNumber: 5, par: 4, strokeIndex: 3, yards: 385 },
        { holeNumber: 6, par: 3, strokeIndex: 7, yards: 171 },
        { holeNumber: 7, par: 4, strokeIndex: 8, yards: 276 },
        { holeNumber: 8, par: 5, strokeIndex: 2, yards: 532 },
        { holeNumber: 9, par: 4, strokeIndex: 4, yards: 368 },
      ]);
    }
    toast({ title: `Erie Village ${course.layout === "front" ? "Front 9" : "Back 9"} loaded — click Save to apply` });
  };

  const save = async () => {
    // Validate stroke indexes 1..9 unique
    const sis = rows.map(r => r.strokeIndex);
    const set = new Set(sis);
    if (set.size !== 9 || sis.some(s => s < 1 || s > 9)) {
      toast({ title: "Stroke indexes must be 1..9, each used once", variant: "destructive" });
      return;
    }
    await apiRequest("PATCH", `/api/courses/${course.id}`, {
      name,
      courseRating: rating ? parseFloat(rating) : null,
      slope: slope ? parseInt(slope, 10) : null,
    });
    await apiRequest("POST", `/api/courses/${course.id}/holes/upsert`, rows.map(r => ({
      holeNumber: r.holeNumber, par: r.par, strokeIndex: r.strokeIndex, yards: r.yards,
    })));
    qc.invalidateQueries();
    toast({ title: `${course.layout === "front" ? "Front 9" : "Back 9"} saved` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base capitalize">{course.layout} 9 — {name}</CardTitle>
        <CardDescription>Configure par, stroke index (1=hardest), yards. Optional course rating/slope used for handicap differentials.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <div><Label>Course name</Label><Input value={name} onChange={e => setName(e.target.value)} data-testid={`input-course-name-${course.id}`} /></div>
          <div><Label>Course rating (9)</Label><Input value={rating} onChange={e => setRating(e.target.value)} placeholder="Optional" data-testid={`input-rating-${course.id}`} /></div>
          <div><Label>Slope (9)</Label><Input value={slope} onChange={e => setSlope(e.target.value)} placeholder="Optional" data-testid={`input-slope-${course.id}`} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-xs">
              <tr className="text-left">
                <th className="px-2 py-2">Hole</th>
                <th className="px-2 py-2">Par</th>
                <th className="px-2 py-2">Stroke Index</th>
                <th className="px-2 py-2">Yards</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.holeNumber} className="border-t border-border">
                  <td className="px-2 py-1">{r.holeNumber}</td>
                  <td className="px-2 py-1">
                    <Input type="number" min={3} max={6} value={r.par}
                      onChange={e => updateRow(i, { par: Number(e.target.value) })}
                      className="h-8 w-20" data-testid={`input-par-${course.id}-${r.holeNumber}`} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" min={1} max={9} value={r.strokeIndex}
                      onChange={e => updateRow(i, { strokeIndex: Number(e.target.value) })}
                      className="h-8 w-20" data-testid={`input-si-${course.id}-${r.holeNumber}`} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" value={r.yards ?? ""}
                      onChange={e => updateRow(i, { yards: e.target.value ? Number(e.target.value) : null })}
                      className="h-8 w-24" placeholder="—" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <Button variant="outline" onClick={loadEriePreset} data-testid={`button-preset-erie-${course.id}`}>
            Load Erie Village preset
          </Button>
          <Button onClick={save} data-testid={`button-save-course-${course.id}`}><Save className="h-4 w-4 mr-2" />Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Schedule =====
function ScheduleAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: weeks } = useQuery<any[]>({ queryKey: ["/api/weeks"] });
  const { data: courses } = useQuery<any[]>({ queryKey: ["/api/courses"] });
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: matchups } = useQuery<any[]>({ queryKey: ["/api/matchups"] });

  const [wn, setWn] = useState("");
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState("");
  // Format defaults to team_match_play (the league's standing format) so
  // existing flows are unchanged. The dropdown only exposes other formats
  // when VITE_ENABLE_NEW_FORMATS=true is set in .env at build time — see
  // client/src/lib/featureFlags.ts.
  const formats = availableFormats();
  const [format, setFormat] = useState<string>(formats[0]?.id ?? "team_match_play");

  const addWeek = async () => {
    if (!wn || !date || !courseId) return;
    await apiRequest("POST", "/api/weeks", {
      weekNumber: Number(wn),
      date,
      courseId: Number(courseId),
      notes: null,
      format,
      // Inherit format-specific defaults from the scorer's Zod schema —
      // empty object is fine because every config field has a default.
      formatConfig: format === "team_match_play" ? null : {},
    });
    setWn(""); setDate(""); setCourseId("");
    setFormat(formats[0]?.id ?? "team_match_play");
    qc.invalidateQueries();
    toast({ title: "Week added" });
  };
  const delWeek = async (id: number) => {
    if (!confirm("Delete this week and ALL its scores?")) return;
    await apiRequest("DELETE", `/api/weeks/${id}`);
    qc.invalidateQueries();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Add Week</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input placeholder="Week #" type="number" value={wn} onChange={e => setWn(e.target.value)} className="w-24" data-testid="input-week-number" />
          <Input placeholder="Date" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" data-testid="input-week-date" />
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-48" data-testid="select-week-course"><SelectValue placeholder="Layout" /></SelectTrigger>
            <SelectContent>
              {(courses || []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.layout === "front" ? "Front 9" : "Back 9"} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Format dropdown only shows multiple options when
              VITE_ENABLE_NEW_FORMATS=true. With the flag off, it renders a
              single-option select that's effectively a label, so legacy
              admins see no surface change. */}
          {formats.length > 1 && (
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="w-56" data-testid="select-week-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                {formats.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={addWeek} data-testid="button-add-week"><Plus className="h-4 w-4 mr-2" />Add</Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(weeks || []).map(w => (
          <WeekMatchupsCard
            key={w.id}
            week={w}
            courses={courses || []}
            teams={teams || []}
            matchups={(matchups || []).filter(m => m.weekId === w.id)}
            onDelete={() => delWeek(w.id)}
          />
        ))}
      </div>
    </div>
  );
}

function WeekMatchupsCard({ week, courses, teams, matchups, onDelete }: any) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const course = courses.find((c: any) => c.id === week.courseId);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");

  const addMatchup = async () => {
    if (!aId || !bId || aId === bId) return;
    await apiRequest("POST", "/api/matchups", { weekId: week.id, teamAId: Number(aId), teamBId: Number(bId) });
    setAId(""); setBId("");
    qc.invalidateQueries();
    toast({ title: "Matchup added" });
  };

  const delMatchup = async (id: number) => {
    await apiRequest("DELETE", `/api/matchups/${id}`);
    qc.invalidateQueries();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Week {week.weekNumber} — {week.date}
            <span className="text-xs ml-2 text-muted-foreground">({course?.layout === "front" ? "Front 9" : "Back 9"})</span>
            {/* Always show the format here for admins — they create
                weeks with format pickers, so they want the same answer
                visible at a glance on the management list. Members get
                the lighter "only when non-default" treatment elsewhere. */}
            {week.format && (
              <span className="text-xs ml-2 text-muted-foreground" data-testid={`text-week-format-${week.id}`}>
                · {formatLabel(week.format)}
              </span>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-week-${week.id}`}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 mb-3">
          {matchups.length === 0 && <div className="text-sm text-muted-foreground">No matchups yet.</div>}
          {matchups.map((m: any) => {
            const a = teams.find((t: any) => t.id === m.teamAId);
            const b = teams.find((t: any) => t.id === m.teamBId);
            return (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{a?.name || "?"}</span>
                <span className="text-muted-foreground">vs</span>
                <span className="flex-1">{b?.name || "?"}</span>
                <Button variant="ghost" size="icon" onClick={() => delMatchup(m.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 flex-wrap items-end pt-3 border-t border-border">
          <div>
            <Label className="text-xs">Team A</Label>
            <Select value={aId} onValueChange={setAId}>
              <SelectTrigger className="w-44" data-testid={`select-team-a-${week.id}`}><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>{teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Team B</Label>
            <Select value={bId} onValueChange={setBId}>
              <SelectTrigger className="w-44" data-testid={`select-team-b-${week.id}`}><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>{teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={addMatchup} data-testid={`button-add-matchup-${week.id}`}><Plus className="h-4 w-4 mr-2" />Add Matchup</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Config =====
function ConfigAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => { if (settings) setDraft({ ...settings }); }, [settings]);
  if (!draft) return null;

  const set = (k: string, v: any) => setDraft({ ...draft, [k]: v });

  const save = async () => {
    await apiRequest("PATCH", "/api/settings", {
      pointsPerHoleWin: Number(draft.pointsPerHoleWin),
      pointsPerHoleTie: Number(draft.pointsPerHoleTie),
      pointsForMatchWin: Number(draft.pointsForMatchWin),
      holeMaxStrokes: Number(draft.holeMaxStrokes),
      handicapFactor: Number(draft.handicapFactor),
      handicapRules: String(draft.handicapRules),
      skinsScope: draft.skinsScope,
      guestViewing: !!draft.guestViewing,
      teamHandicapFormula: draft.teamHandicapFormula,
      skinsPotPerWeek: Number(draft.skinsPotPerWeek),
    });
    qc.invalidateQueries();
    toast({ title: "Settings saved (recomputed everything)" });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Points & Handicap Configuration</CardTitle><CardDescription>Saving will recompute all weeks.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label>Points per hole win</Label><Input type="number" step="0.5" value={draft.pointsPerHoleWin} onChange={e => set("pointsPerHoleWin", e.target.value)} data-testid="input-pts-hole-win" /></div>
          <div><Label>Points per hole tie</Label><Input type="number" step="0.5" value={draft.pointsPerHoleTie} onChange={e => set("pointsPerHoleTie", e.target.value)} data-testid="input-pts-hole-tie" /></div>
          <div><Label>Match-win bonus</Label><Input type="number" step="0.5" value={draft.pointsForMatchWin} onChange={e => set("pointsForMatchWin", e.target.value)} data-testid="input-pts-match-win" /></div>
          <div><Label>Hole max strokes (ESC)</Label><Input type="number" value={draft.holeMaxStrokes} onChange={e => set("holeMaxStrokes", e.target.value)} data-testid="input-hole-max" /></div>
          <div><Label>Handicap factor (e.g. 0.96)</Label><Input type="number" step="0.01" value={draft.handicapFactor} onChange={e => set("handicapFactor", e.target.value)} data-testid="input-hcp-factor" /></div>
          <div>
            <Label>Team handicap formula</Label>
            <Select value={draft.teamHandicapFormula} onValueChange={v => set("teamHandicapFormula", v)}>
              <SelectTrigger data-testid="select-team-hcp-formula"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sum">Sum</SelectItem><SelectItem value="avg">Average</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3">
            <Label>Handicap rules (best/last per round count, comma separated)</Label>
            <Input value={draft.handicapRules} onChange={e => set("handicapRules", e.target.value)} data-testid="input-hcp-rules" />
            <div className="text-xs text-muted-foreground mt-1">Default: <span className="font-mono">1/1,1/2,1/3,2/4,3/5</span> — after 5+ rounds, best 3 of last 5.</div>
          </div>
          <div>
            <Label>Skins scope</Label>
            <Select value={draft.skinsScope} onValueChange={v => set("skinsScope", v)}>
              <SelectTrigger data-testid="select-skins-scope"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="league">League-wide</SelectItem><SelectItem value="matchup">Matchup-only</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Skins pot per week ($)</Label>
            <Input type="number" step="1" value={draft.skinsPotPerWeek ?? 200} onChange={e => set("skinsPotPerWeek", e.target.value)} data-testid="input-skins-pot" />
            <div className="text-xs text-muted-foreground mt-1">If no skins are won that week, the entire pot rolls into next week.</div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label>Guest viewing</Label>
              <div className="text-xs text-muted-foreground">Allow non-logged-in users to view leaderboard.</div>
            </div>
            <Switch checked={!!draft.guestViewing} onCheckedChange={v => set("guestViewing", v)} data-testid="switch-guest-viewing" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={save} data-testid="button-save-settings"><Save className="h-4 w-4 mr-2" />Save</Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await apiRequest("POST", "/api/admin/recompute");
                const json = await res.json();
                qc.invalidateQueries();
                toast({
                  title: "Recomputed",
                  description: `Rebuilt handicaps, points, and skins for ${json.weeksProcessed} week(s).`,
                });
              } catch (e: any) {
                toast({ title: "Recompute failed", description: e?.message || "Unknown error", variant: "destructive" });
              }
            }}
            data-testid="button-recompute-all"
          >
            Recompute all weeks
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Bulk Import =====
function BulkImportAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: weeks } = useQuery<any[]>({ queryKey: ["/api/weeks"] });
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const [weekId, setWeekId] = useState("");
  const [grid, setGrid] = useState<Record<number, number[]>>({});

  useEffect(() => {
    if (!teams) return;
    const g: Record<number, number[]> = {};
    for (const t of teams) g[t.id] = Array(9).fill(0);
    setGrid(g);
  }, [teams]);

  const setCell = (tid: number, hole: number, v: number) => {
    setGrid(prev => {
      const next = { ...prev };
      const arr = [...(next[tid] || Array(9).fill(0))];
      arr[hole] = Math.max(0, Math.min(15, v || 0));
      next[tid] = arr;
      return next;
    });
  };

  const submit = async () => {
    if (!weekId) { toast({ title: "Pick a week", variant: "destructive" }); return; }
    const entries: any[] = [];
    for (const t of (teams || [])) {
      const arr = grid[t.id] || [];
      if (arr.every(x => x === 0)) continue;
      if (arr.some(x => x < 1 || x > 15)) {
        toast({ title: `Invalid scores for ${t.name}`, description: "Scores 1-15 on every hole, or all blank to skip.", variant: "destructive" });
        return;
      }
      entries.push({ teamId: t.id, weekId: Number(weekId), holes: arr });
    }
    if (entries.length === 0) { toast({ title: "Nothing to import" }); return; }
    await apiRequest("POST", "/api/team-scores/bulk", { entries });
    qc.invalidateQueries();
    toast({ title: `Imported ${entries.length} team rounds` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bulk Import (paste-friendly grid)</CardTitle>
        <CardDescription>One row per team (best-ball score), 9 holes. Leave a row all-zero to skip. Submitting will recompute team handicaps, points, and skins.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-2 items-end flex-wrap">
          <div>
            <Label>Week</Label>
            <Select value={weekId} onValueChange={setWeekId}>
              <SelectTrigger className="w-56" data-testid="select-bulk-week"><SelectValue placeholder="Choose week" /></SelectTrigger>
              <SelectContent>{(weeks || []).map(w => <SelectItem key={w.id} value={String(w.id)}>Week {w.weekNumber} — {w.date}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={submit} data-testid="button-bulk-submit"><Save className="h-4 w-4 mr-2" />Import</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-xs">
              <tr><th className="px-2 py-1 text-left">Team</th>
                {Array.from({ length: 9 }, (_, i) => <th key={i} className="px-1 py-1 text-center w-12">H{i + 1}</th>)}
                <th className="px-2 py-1 text-right">Tot</th>
              </tr>
            </thead>
            <tbody>
              {(teams || []).map(t => {
                const arr = grid[t.id] || Array(9).fill(0);
                const tot = arr.reduce((s, x) => s + x, 0);
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-2 py-1 font-medium whitespace-nowrap">{t.name}</td>
                    {arr.map((v: number, i: number) => (
                      <td key={i} className="px-1 py-1">
                        <input
                          type="number" min={0} max={15} value={v || ""}
                          onChange={e => setCell(t.id, i, Number(e.target.value))}
                          className="w-12 h-8 text-center border border-border rounded bg-background"
                          data-testid={`bulk-input-${t.id}-h${i + 1}`}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-bold">{tot || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Override =====
function OverrideAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: weeks } = useQuery<any[]>({ queryKey: ["/api/weeks"] });
  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const [weekId, setWeekId] = useState("");
  const { data: existing } = useQuery<any[]>({
    queryKey: ["/api/team-scores", weekId],
    queryFn: async () => {
      if (!weekId) return [];
      const res = await apiRequest("GET", `/api/team-scores?weekId=${weekId}`);
      return res.json();
    },
    enabled: !!weekId,
  });
  const [grid, setGrid] = useState<Record<number, number[]>>({});

  useEffect(() => {
    if (!teams) return;
    const g: Record<number, number[]> = {};
    for (const t of teams) g[t.id] = Array(9).fill(0);
    if (existing) {
      for (const s of existing) {
        if (!g[s.teamId]) g[s.teamId] = Array(9).fill(0);
        g[s.teamId][s.holeNumber - 1] = s.strokes;
      }
    }
    setGrid(g);
  }, [teams, existing, weekId]);

  const setCell = (tid: number, hole: number, v: number) => {
    setGrid(prev => {
      const next = { ...prev };
      const arr = [...(next[tid] || Array(9).fill(0))];
      arr[hole] = Math.max(0, Math.min(15, v || 0));
      next[tid] = arr;
      return next;
    });
  };

  const save = async () => {
    if (!weekId) return;
    const entries: any[] = [];
    for (const t of (teams || [])) {
      const arr = grid[t.id] || [];
      if (arr.every(x => x === 0)) continue;
      if (arr.some(x => x < 1 || x > 15)) {
        toast({ title: `Invalid scores for ${t.name}`, variant: "destructive" });
        return;
      }
      entries.push({ teamId: t.id, weekId: Number(weekId), holes: arr });
    }
    if (entries.length === 0) { toast({ title: "Nothing to save" }); return; }
    await apiRequest("POST", "/api/team-scores/bulk", { entries });
    qc.invalidateQueries();
    toast({ title: "Scores saved" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Manual Override</CardTitle>
        <CardDescription>Edit any week's team scores. Will recompute everything from this week forward.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-2 items-end flex-wrap">
          <div>
            <Label>Week</Label>
            <Select value={weekId} onValueChange={setWeekId}>
              <SelectTrigger className="w-56" data-testid="select-override-week"><SelectValue placeholder="Choose week" /></SelectTrigger>
              <SelectContent>{(weeks || []).map(w => <SelectItem key={w.id} value={String(w.id)}>Week {w.weekNumber} — {w.date}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {weekId && <Button onClick={save} data-testid="button-override-save"><Save className="h-4 w-4 mr-2" />Save</Button>}
        </div>

        {weekId && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-muted-foreground text-xs">
                <tr><th className="px-2 py-1 text-left">Team</th>
                  {Array.from({ length: 9 }, (_, i) => <th key={i} className="px-1 py-1 text-center w-12">H{i + 1}</th>)}
                  <th className="px-2 py-1 text-right">Tot</th>
                </tr>
              </thead>
              <tbody>
                {(teams || []).map(t => {
                  const arr = grid[t.id] || Array(9).fill(0);
                  const tot = arr.reduce((s, x) => s + x, 0);
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-2 py-1 font-medium whitespace-nowrap">{t.name}</td>
                      {arr.map((v: number, i: number) => (
                        <td key={i} className="px-1 py-1">
                          <input
                            type="number" min={0} max={15} value={v || ""}
                            onChange={e => setCell(t.id, i, Number(e.target.value))}
                            className="w-12 h-8 text-center border border-border rounded bg-background"
                            data-testid={`override-input-${t.id}-h${i + 1}`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right font-bold">{tot || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
