import type { Express, Response } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  authMiddleware, requireAuth, requireAdmin, login, logout,
  type AuthedRequest,
} from "./auth";
import {
  insertPlayerSchema, insertTeamSchema, insertCourseSchema, insertHoleSchema,
  insertWeekSchema, insertMatchupSchema,
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { allocateStrokes } from "./lib/scoring";
import { getScorer, DEFAULT_FORMAT, scorers } from "./lib/scoring/registry";
import { computePayouts } from "./lib/payouts";
import { searchCourses as gcaSearch, getCourse as gcaGetCourse } from "./lib/golfCourseApi";
import { fetchGolfFeatures } from "./lib/overpass";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(authMiddleware);

  // ===== Auth =====
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: "Missing credentials" });
    const user = storage.getUserByUsername(String(username));
    if (!user) return res.status(401).json({ message: "Invalid username or password" });
    if (!storage.verifyPassword(user, String(password))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    const token = login(res, user.id);
    res.json({ id: user.id, username: user.username, role: user.role, playerId: user.playerId, token });
  });

  app.post("/api/auth/logout", (req, res) => {
    logout(req, res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req: AuthedRequest, res) => {
    if (!req.userId) {
      const cfg = storage.getSettings();
      return res.json({ user: null, guestViewing: cfg.guestViewing });
    }
    const u = storage.getUser(req.userId);
    if (!u) return res.json({ user: null });
    res.json({
      user: { id: u.id, username: u.username, role: u.role, playerId: u.playerId },
      guestViewing: storage.getSettings().guestViewing,
    });
  });

  // ===== Emergency admin recovery =====
  // Requires the RECOVERY_CODE env var to be set on the server. Returning
  // 503 when it's missing is intentional: previously this endpoint had a
  // hardcoded fallback ("erie-village-2026-reset") that would let anyone
  // who read the public source reset any user's password. Treating the
  // endpoint as unavailable when no code is configured means a misconfigured
  // deploy fails closed instead of fails open.
  app.post("/api/auth/recover", (req, res) => {
    const { recoveryCode, username, newPassword } = req.body || {};
    const expected = process.env.RECOVERY_CODE;
    if (!expected) {
      return res.status(503).json({ message: "Recovery is not configured on this server" });
    }
    if (!recoveryCode || String(recoveryCode) !== expected) {
      return res.status(401).json({ message: "Invalid recovery code" });
    }
    if (!username || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: "Username and 6+ char password required" });
    }
    const u = storage.getUserByUsername(String(username));
    if (!u) return res.status(404).json({ message: "User not found" });
    storage.setPassword(u.id, String(newPassword));
    res.json({ ok: true, message: "Password reset. You can now log in." });
  });

  app.post("/api/auth/change-password", requireAuth, (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Missing fields" });
    const u = storage.getUser(req.userId!)!;
    if (!storage.verifyPassword(u, String(currentPassword))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    if (String(newPassword).length < 6) return res.status(400).json({ message: "New password must be at least 6 characters" });
    storage.setPassword(u.id, String(newPassword));
    res.json({ ok: true });
  });

  // ===== Players =====
  app.get("/api/players", (_req, res) => res.json(storage.listPlayers()));
  app.get("/api/players/:id", (req, res) => {
    const p = storage.getPlayer(Number(req.params.id));
    if (!p) return res.status(404).json({ message: "Not found" });
    res.json(p);
  });
  app.post("/api/players", requireAdmin, (req, res) => {
    const data = insertPlayerSchema.parse(req.body);
    res.json(storage.createPlayer(data));
  });
  app.patch("/api/players/:id", requireAdmin, (req, res) => {
    const data = insertPlayerSchema.partial().parse(req.body);
    res.json(storage.updatePlayer(Number(req.params.id), data));
  });
  app.delete("/api/players/:id", requireAdmin, (req, res) => {
    storage.deletePlayer(Number(req.params.id));
    res.json({ ok: true });
  });

  // Stub: per-player handicap history is deprecated in team-only mode
  app.get("/api/players/:id/handicap-history", (_req, res) => {
    res.json([]);
  });

  // ===== Users =====
  app.get("/api/users", requireAdmin, (_req, res) => {
    const rows = storage.listUsers().map(u => ({
      id: u.id, username: u.username, role: u.role, playerId: u.playerId,
    }));
    res.json(rows);
  });
  app.post("/api/users", requireAdmin, (req, res) => {
    const schema = z.object({
      username: z.string().min(2),
      password: z.string().min(4),
      role: z.enum(["admin", "member"]).default("member"),
      playerId: z.number().nullable().optional(),
    });
    const data = schema.parse(req.body);
    const existing = storage.getUserByUsername(data.username);
    if (existing) return res.status(400).json({ message: "Username taken" });
    const hash = bcrypt.hashSync(data.password, 10);
    const u = storage.createUser({ username: data.username, passwordHash: hash, role: data.role, playerId: data.playerId ?? null });
    res.json({ id: u.id, username: u.username, role: u.role, playerId: u.playerId });
  });
  app.patch("/api/users/:id", requireAdmin, (req, res) => {
    const schema = z.object({
      username: z.string().min(2).optional(),
      role: z.enum(["admin", "member"]).optional(),
      playerId: z.number().nullable().optional(),
    });
    const data = schema.parse(req.body);
    const updated = storage.updateUser(Number(req.params.id), data);
    res.json({ id: updated.id, username: updated.username, role: updated.role, playerId: updated.playerId });
  });
  app.post("/api/users/:id/reset-password", requireAdmin, (req, res) => {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ message: "Password must be at least 4 chars" });
    storage.setPassword(Number(req.params.id), String(newPassword));
    res.json({ ok: true });
  });
  app.delete("/api/users/:id", requireAdmin, (req, res) => {
    storage.deleteUser(Number(req.params.id));
    res.json({ ok: true });
  });

  // ===== Teams =====
  app.get("/api/teams", (_req, res) => res.json(storage.listTeams()));
  app.post("/api/teams", requireAdmin, (req, res) => {
    const data = insertTeamSchema.parse(req.body);
    res.json(storage.createTeam(data));
  });
  app.patch("/api/teams/:id", requireAdmin, (req, res) => {
    const data = insertTeamSchema.partial().parse(req.body);
    res.json(storage.updateTeam(Number(req.params.id), data));
  });
  app.delete("/api/teams/:id", requireAdmin, (req, res) => {
    storage.deleteTeam(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/teams/:id/handicap-history", (req, res) => {
    const tid = Number(req.params.id);
    const rows = storage.listTeamHandicapHistory(tid);
    const allWeeks = storage.listWeeks();
    const wmap: Record<number, any> = {};
    for (const w of allWeeks) wmap[w.id] = w;
    const enriched = rows.map(r => ({
      ...r,
      weekNumber: wmap[r.weekId]?.weekNumber,
      date: wmap[r.weekId]?.date,
    })).sort((a, b) => (a.weekNumber || 0) - (b.weekNumber || 0));
    res.json(enriched);
  });

  // ===== Courses =====
  app.get("/api/courses", (_req, res) => res.json(storage.listCourses()));
  app.post("/api/courses", requireAdmin, (req, res) => {
    const data = insertCourseSchema.parse(req.body);
    res.json(storage.createCourse(data));
  });
  app.patch("/api/courses/:id", requireAdmin, (req, res) => {
    const data = insertCourseSchema.partial().parse(req.body);
    res.json(storage.updateCourse(Number(req.params.id), data));
  });
  app.get("/api/courses/:id/holes", (req, res) => {
    res.json(storage.listHoles(Number(req.params.id)));
  });
  app.post("/api/courses/:id/holes/upsert", requireAdmin, (req, res) => {
    const courseId = Number(req.params.id);
    const arr = z.array(insertHoleSchema.omit({ courseId: true })).parse(req.body);
    for (const h of arr) {
      storage.upsertHole({ ...h, courseId });
    }
    const weeksOnCourse = storage.listWeeks().filter(w => w.courseId === courseId);
    if (weeksOnCourse.length > 0) {
      const earliest = weeksOnCourse.reduce((a, b) => a.weekNumber < b.weekNumber ? a : b);
      storage.recomputeFromWeek(earliest.id);
    }
    res.json(storage.listHoles(courseId));
  });

  // ===== Course Catalog (GolfCourseAPI proxy + local cache) =====
  // All endpoints are admin-only: search hits the upstream API (rate-limited),
  // import caches a course's tees + holes locally, and apply maps a catalog
  // tee onto an existing 9-hole league layout.
  app.get("/api/catalog/search", requireAdmin, async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ message: "Missing q" });
    try {
      const result = await gcaSearch(q);
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ message: err?.message || "Upstream error" });
    }
  });

  app.get("/api/catalog/courses", requireAdmin, (_req, res) => {
    res.json(storage.listGolfCourses());
  });

  app.get("/api/catalog/courses/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const course = storage.getGolfCourse(id);
    if (!course) return res.status(404).json({ message: "Not found" });
    const tees = storage.listGolfCourseTees(id).map(t => ({
      ...t,
      holes: storage.listGolfCourseHoles(t.id),
    }));
    res.json({ ...course, tees });
  });

  // Manually create a catalog course (for courses missing from GolfCourseAPI).
  // Stores just name + lat/lng — enough for OSM green lookups + GPS distances.
  // Scorecard data is not required since admins can populate it via the
  // existing CourseAdmin UI on the linked 9-hole layout (or via the Erie
  // Village preset).
  app.post("/api/catalog/manual", requireAdmin, (req, res) => {
    const schema = z.object({
      clubName: z.string().min(1),
      courseName: z.string().min(1),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      latitude: z.number(),
      longitude: z.number(),
    });
    const data = schema.parse(req.body);
    // Use a synthetic gca_id (negative) so it doesn't collide with real ones.
    // We pick the next available negative id deterministically.
    const all = storage.listGolfCourses();
    const minSynthetic = all
      .map(c => c.gcaId)
      .filter(id => id < 0)
      .reduce((m, v) => Math.min(m, v), 0);
    const syntheticId = minSynthetic - 1;
    // Insert via the same upsert path as imported courses; importGolfCourse
    // expects a GolfCourseApiCourse-shaped payload, so we hand-craft one.
    const saved = storage.importGolfCourse({
      id: syntheticId,
      club_name: data.clubName,
      course_name: data.courseName,
      location: {
        address: data.address ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        country: data.country ?? null,
        latitude: data.latitude,
        longitude: data.longitude,
      },
      tees: { male: [], female: [] },
    } as any);
    res.json(saved);
  });

  // Link an existing 9-hole league layout to a catalog course without copying
  // a tee's scorecard data. Useful when the layout's pars/SI/yards are already
  // populated (e.g. from a preset) and we only need GPS data on the layout.
  app.post("/api/catalog/link", requireAdmin, (req, res) => {
    const schema = z.object({
      layoutCourseId: z.number().int(),
      catalogCourseId: z.number().int(),
      startHole: z.number().int().min(1).max(10),
    });
    const args = schema.parse(req.body);
    const layout = storage.getCourse(args.layoutCourseId);
    if (!layout) return res.status(404).json({ message: "Layout not found" });
    const catalog = storage.getGolfCourse(args.catalogCourseId);
    if (!catalog) return res.status(404).json({ message: "Catalog course not found" });
    storage.updateCourse(args.layoutCourseId, {
      catalogCourseId: args.catalogCourseId,
      startHole: args.startHole,
    });
    res.json({ ok: true });
  });

  app.post("/api/catalog/import", requireAdmin, async (req, res) => {
    const gcaId = Number(req.body?.gcaId);
    if (!gcaId) return res.status(400).json({ message: "Missing gcaId" });
    try {
      const payload = await gcaGetCourse(gcaId);
      console.log(
        `[catalog] import gcaId=${gcaId} payload.id=${payload.id} ` +
        `club="${payload.club_name}" course="${payload.course_name}" ` +
        `tees=${(payload.tees?.male?.length ?? 0) + (payload.tees?.female?.length ?? 0)}`,
      );
      const saved = storage.importGolfCourse(payload);
      res.json(saved);
    } catch (err: any) {
      console.error(`[catalog] import failed for gcaId=${gcaId}:`, err?.stack || err?.message || err);
      res.status(502).json({ message: err?.message || "Import failed" });
    }
  });

  // ===== Course GPS / Geo =====
  // Fetch greens + tees from OpenStreetMap and upsert into course_hole_geo.
  // Greens with `ref` tags get auto-assigned to a hole; the rest are stored
  // unassigned (holeNumber=null) so the admin can assign them on a map.
  app.post("/api/catalog/courses/:id/geo/refresh", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const course = storage.getGolfCourse(id);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (course.latitude == null || course.longitude == null) {
      return res.status(400).json({ message: "Course has no lat/lng — cannot query OSM" });
    }
    try {
      const features = await fetchGolfFeatures(course.latitude, course.longitude);
      // We DO NOT pre-wipe OSM rows. upsertCourseHoleGeo / upsertCourseTeeGeo
      // dedupe by osm_way_id and preserve any holeNumber the admin already
      // set, so re-running Refresh is safe — it refreshes lat/lng/polygon
      // for known features and adds rows for any new ones, without losing
      // hole assignments. Stale rows (OSM features that were removed)
      // remain visible in the admin so they can be deleted manually.
      // Map tees to a quick-lookup by `ref` so we can attach a tee centroid
      // to greens that share a ref tag (back-compat with the embedded
      // teeLat/teeLng — kept so old data stays renderable).
      const teeByRef: Record<number, { lat: number; lng: number }> = {};
      for (const t of features.tees) {
        if (t.ref != null) teeByRef[t.ref] = t.centroid;
      }
      for (const g of features.greens) {
        const tee = g.ref != null ? teeByRef[g.ref] : undefined;
        storage.upsertCourseHoleGeo({
          golfCourseId: id,
          holeNumber: g.ref,
          greenLat: g.centroid.lat,
          greenLng: g.centroid.lng,
          greenPolygonJson: JSON.stringify(g.polygon),
          teeLat: tee?.lat ?? null,
          teeLng: tee?.lng ?? null,
          source: "osm",
          osmWayId: g.wayId,
        });
      }
      // Independent tee rows — every OSM tee gets stored, auto-assigned by
      // `ref` when present so admins only have to fix the ones OSM didn't tag.
      for (const t of features.tees) {
        storage.upsertCourseTeeGeo({
          golfCourseId: id,
          holeNumber: t.ref,
          lat: t.centroid.lat,
          lng: t.centroid.lng,
          source: "osm",
          osmWayId: t.wayId,
        });
      }
      const allGreens = storage.listCourseHoleGeo(id);
      const allTees = storage.listCourseTeeGeo(id);
      res.json({
        ok: true,
        greensFound: features.greens.length,
        teesFound: features.tees.length,
        // Total counts of rows currently in the DB (post-upsert). Includes
        // both OSM-ref-derived auto-assignments and any manual assignments
        // the admin made previously — those are preserved across refreshes.
        greensAssigned: allGreens.filter(r => r.holeNumber != null).length,
        greensUnassigned: allGreens.filter(r => r.holeNumber == null).length,
        teesAssigned: allTees.filter(r => r.holeNumber != null).length,
        teesUnassigned: allTees.filter(r => r.holeNumber == null).length,
      });
    } catch (err: any) {
      res.status(502).json({ message: err?.message || "OSM fetch failed" });
    }
  });

  app.get("/api/catalog/courses/:id/geo", (req, res) => {
    const id = Number(req.params.id);
    const course = storage.getGolfCourse(id);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const greens = storage.listCourseHoleGeo(id);
    const tees = storage.listCourseTeeGeo(id);
    res.json({
      course: {
        id: course.id,
        latitude: course.latitude,
        longitude: course.longitude,
        clubName: course.clubName,
        courseName: course.courseName,
      },
      holes: greens.map(r => ({
        ...r,
        polygon: r.greenPolygonJson ? JSON.parse(r.greenPolygonJson) : null,
      })),
      tees,
    });
  });

  app.patch("/api/geo/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      holeNumber: z.number().int().min(1).max(18).nullable(),
    });
    const { holeNumber } = schema.parse(req.body);
    const updated = storage.reassignCourseHoleGeo(id, holeNumber);
    res.json(updated);
  });

  app.delete("/api/geo/:id", requireAdmin, (req, res) => {
    storage.deleteCourseHoleGeo(Number(req.params.id));
    res.json({ ok: true });
  });

  app.patch("/api/tee-geo/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({
      holeNumber: z.number().int().min(1).max(18).nullable(),
    });
    const { holeNumber } = schema.parse(req.body);
    const updated = storage.reassignCourseTeeGeo(id, holeNumber);
    res.json(updated);
  });

  app.delete("/api/tee-geo/:id", requireAdmin, (req, res) => {
    storage.deleteCourseTeeGeo(Number(req.params.id));
    res.json({ ok: true });
  });

  // Bulk-delete every row with hole_number = null for a course. Useful after
  // an OSM refresh on a course with multiple tee sets — admins assign one
  // tee per hole, then sweep the rest in one click.
  app.post("/api/catalog/courses/:id/geo/delete-unassigned", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({ kind: z.enum(["greens", "tees", "both"]).default("both") });
    const { kind } = schema.parse(req.body || {});
    const deleted = storage.deleteUnassignedGeo(id, kind);
    res.json({ ok: true, ...deleted });
  });

  // Geo for a league `weeks/:id` — convenience endpoint that resolves the
  // week's 9-hole layout to its catalog course + start hole and returns the
  // 9 corresponding green polygons. Returns null/empty when no GPS data is
  // available so the client can degrade gracefully.
  app.get("/api/weeks/:id/geo", (req, res) => {
    const week = storage.getWeek(Number(req.params.id));
    if (!week) return res.status(404).json({ message: "Week not found" });
    const layout = storage.getCourse(week.courseId);
    if (!layout || !layout.catalogCourseId) return res.json({ holes: [] });
    const start = layout.startHole ?? 1;
    const allGreens = storage.listCourseHoleGeo(layout.catalogCourseId);
    const allTees = storage.listCourseTeeGeo(layout.catalogCourseId);
    const greenByHole: Record<number, any> = {};
    for (const g of allGreens) {
      if (g.holeNumber != null) greenByHole[g.holeNumber] = g;
    }
    const teeByHole: Record<number, any> = {};
    for (const t of allTees) {
      if (t.holeNumber != null) teeByHole[t.holeNumber] = t;
    }
    const holes: any[] = [];
    for (let i = 0; i < 9; i++) {
      const catalogHole = start + i;
      const g = greenByHole[catalogHole];
      // Prefer the standalone tee row; fall back to the legacy tee centroid
      // embedded on the green's row (older data, when tees auto-attached
      // by `ref` only).
      const t = teeByHole[catalogHole];
      const teeLatLng = t
        ? { lat: t.lat, lng: t.lng }
        : (g && g.teeLat != null && g.teeLng != null ? { lat: g.teeLat, lng: g.teeLng } : null);
      holes.push({
        leagueHole: i + 1,
        catalogHole,
        green: g ? {
          lat: g.greenLat,
          lng: g.greenLng,
          polygon: g.greenPolygonJson ? JSON.parse(g.greenPolygonJson) : null,
        } : null,
        tee: teeLatLng,
      });
    }
    res.json({ holes });
  });

  app.post("/api/catalog/apply", requireAdmin, (req, res) => {
    const schema = z.object({
      layoutCourseId: z.number().int(),
      catalogCourseId: z.number().int(),
      teeId: z.number().int(),
      startHole: z.number().int().min(1).max(10).default(1),
    });
    const args = schema.parse(req.body);
    try {
      const result = storage.applyCatalogTeeToLayout(args);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err?.message || "Apply failed" });
    }
  });

  // ===== Weeks =====
  app.get("/api/weeks", (_req, res) => res.json(storage.listWeeks()));
  app.get("/api/weeks/:id", (req, res) => {
    const w = storage.getWeek(Number(req.params.id));
    if (!w) return res.status(404).json({ message: "Not found" });
    res.json(w);
  });
  app.post("/api/weeks", requireAdmin, (req, res) => {
    const data = insertWeekSchema.parse(req.body);
    // Format-aware validation: if the admin picked a non-default format
    // (or supplied formatConfig), make sure the format is registered and
    // the config matches its Zod schema. Catches typos and invalid configs
    // at write time rather than at score-recompute time.
    if (data.format) {
      const scorer = scorers[data.format];
      if (!scorer) {
        return res.status(400).json({
          message: `Unknown scoring format "${data.format}". Registered: [${Object.keys(scorers).join(", ")}]`,
        });
      }
      if (data.formatConfig != null) {
        const parsed = scorer.configSchema.safeParse(data.formatConfig);
        if (!parsed.success) {
          return res.status(400).json({
            message: `Invalid formatConfig for ${data.format}: ${parsed.error.message}`,
          });
        }
      }
    }
    res.json(storage.createWeek(data));
  });
  app.patch("/api/weeks/:id", requireAdmin, (req, res) => {
    const data = insertWeekSchema.partial().parse(req.body);
    if (data.format) {
      const scorer = scorers[data.format];
      if (!scorer) {
        return res.status(400).json({
          message: `Unknown scoring format "${data.format}". Registered: [${Object.keys(scorers).join(", ")}]`,
        });
      }
      if (data.formatConfig != null) {
        const parsed = scorer.configSchema.safeParse(data.formatConfig);
        if (!parsed.success) {
          return res.status(400).json({
            message: `Invalid formatConfig for ${data.format}: ${parsed.error.message}`,
          });
        }
      }
    }
    const w = storage.updateWeek(Number(req.params.id), data);
    storage.recomputeFromWeek(w.id);
    res.json(w);
  });
  app.delete("/api/weeks/:id", requireAdmin, (req, res) => {
    storage.deleteWeek(Number(req.params.id));
    const weeks = storage.listWeeks();
    if (weeks.length > 0) storage.recomputeFromWeek(weeks[0].id);
    res.json({ ok: true });
  });

  // ===== Matchups =====
  app.get("/api/matchups", (req, res) => {
    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    res.json(storage.listMatchups(weekId));
  });
  app.post("/api/matchups", requireAdmin, (req, res) => {
    const data = insertMatchupSchema.parse(req.body);
    const m = storage.createMatchup(data);
    storage.recomputeFromWeek(m.weekId);
    res.json(m);
  });
  app.patch("/api/matchups/:id", requireAdmin, (req, res) => {
    const data = z.object({
      teamAId: z.number().optional(),
      teamBId: z.number().optional(),
    }).parse(req.body);
    const m = storage.updateMatchup(Number(req.params.id), data);
    storage.recomputeFromWeek(m.weekId);
    res.json(m);
  });
  app.delete("/api/matchups/:id", requireAdmin, (req, res) => {
    const m = storage.getMatchup(Number(req.params.id));
    storage.deleteMatchup(Number(req.params.id));
    if (m) storage.recomputeFromWeek(m.weekId);
    res.json({ ok: true });
  });

  // ===== Team Scores (active) =====
  // GET returns team scores for a week (or all if no filter).
  app.get("/api/team-scores", (req, res) => {
    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
    res.json(storage.listTeamScores(weekId, teamId));
  });

  // Legacy /api/scores read endpoint now returns team scores in a similar shape.
  // (Frontend has been migrated to /api/team-scores; this is left for safety.)
  app.get("/api/scores", (req, res) => {
    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    res.json(storage.listTeamScores(weekId));
  });

  function memberCanEditTeam(req: AuthedRequest, teamId: number): boolean {
    if (req.userRole === "admin") return true;
    const u = storage.getUser(req.userId!);
    if (!u || !u.playerId) return false;
    const team = storage.getTeam(teamId);
    if (!team) return false;
    return team.captainId === u.playerId || team.mateId === u.playerId;
  }

  app.post("/api/team-scores/bulk", requireAuth, (req: AuthedRequest, res) => {
    const schema = z.object({
      entries: z.array(z.object({
        teamId: z.number(),
        weekId: z.number(),
        holes: z.array(z.number().int().min(1).max(15)).length(9),
      })),
    });
    const { entries } = schema.parse(req.body);
    for (const e of entries) {
      if (!memberCanEditTeam(req, e.teamId)) {
        return res.status(403).json({ message: `Not allowed to enter scores for team ${e.teamId}` });
      }
    }
    const affectedWeekIds = new Set<number>();
    for (const e of entries) {
      for (let i = 0; i < 9; i++) {
        storage.upsertTeamScore({
          weekId: e.weekId, teamId: e.teamId, holeNumber: i + 1, strokes: e.holes[i],
        });
      }
      affectedWeekIds.add(e.weekId);
    }
    if (affectedWeekIds.size > 0) {
      const allWeeks = storage.listWeeks();
      const ids = Array.from(affectedWeekIds);
      const earliest = ids.map(id => allWeeks.find(w => w.id === id)!).reduce((a, b) => a.weekNumber < b.weekNumber ? a : b);
      storage.recomputeFromWeek(earliest.id);
    }
    res.json({ ok: true });
  });

  // ===== Matchup-level scoring =====
  // Returns everything needed to render the matchup score-entry view:
  // both teams (captain+mate), the week, the course, holes, current scores,
  // and per-hole stroke allocation between the two teams.
  app.get("/api/matchups/:id/details", (req, res) => {
    const matchupId = Number(req.params.id);
    const m = storage.getMatchup(matchupId);
    if (!m) return res.status(404).json({ message: "Matchup not found" });
    const week = storage.getWeek(m.weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });
    const course = storage.getCourse(week.courseId);
    const holes = storage.listHoles(week.courseId);
    const teamA = storage.getTeam(m.teamAId);
    const teamB = storage.getTeam(m.teamBId);
    if (!teamA || !teamB) return res.status(404).json({ message: "Team missing" });
    const playerById = (id: number) => storage.getPlayer(id);
    const teamAScores = storage.listTeamScores(m.weekId, m.teamAId);
    const teamBScores = storage.listTeamScores(m.weekId, m.teamBId);
    const aMap: Record<number, number> = {};
    const bMap: Record<number, number> = {};
    for (const s of teamAScores) aMap[s.holeNumber] = s.strokes;
    for (const s of teamBScores) bMap[s.holeNumber] = s.strokes;

    // Use the team handicaps the engine would use for THIS week to compute
    // stroke allocation. Mirrors playingHcp() in storage.recomputeWeek so the
    // Enter Scores UI and the season recompute always agree.
    //  - Pre-start weeks (weekNumber < team.handicapStartWeek): play scratch (0).
    //  - Otherwise: most recent prior history row, or fall back to the team's
    //    startingHandicap seed if no prior differentials exist yet.
    function teamHcpForWeek(teamId: number, team: { handicapStartWeek?: number | null; startingHandicap?: number | null }): number {
      if (week!.weekNumber < (team.handicapStartWeek ?? 1)) return 0;
      const hist = storage.listTeamHandicapHistory(teamId);
      // history rows have weekId; find the most recent week before this one
      const prior = hist
        .map(h => ({ ...h, wk: storage.getWeek(h.weekId)?.weekNumber ?? 0 }))
        .filter(h => h.wk < week!.weekNumber)
        .sort((a, b) => b.wk - a.wk);
      if (prior.length > 0) return prior[0].handicapAfter;
      return team.startingHandicap ?? 0;
    }
    // Per-team scratch override: a team flagged scratch this matchup (sub played)
    // plays with 0 handicap and the round does not affect their season handicap.
    const aHcp = m.teamAScratch ? 0 : teamHcpForWeek(m.teamAId, teamA);
    const bHcp = m.teamBScratch ? 0 : teamHcpForWeek(m.teamBId, teamB);
    const diff = Math.round(Math.abs(aHcp - bHcp));
    const holeInfos = holes.map(h => ({ holeNumber: h.holeNumber, par: h.par, strokeIndex: h.strokeIndex }));
    let strokesA: Record<number, number> = {};
    let strokesB: Record<number, number> = {};
    if (aHcp > bHcp) {
      strokesA = allocateStrokes(holeInfos, diff);
      for (const h of holeInfos) strokesB[h.holeNumber] = 0;
    } else if (bHcp > aHcp) {
      strokesB = allocateStrokes(holeInfos, diff);
      for (const h of holeInfos) strokesA[h.holeNumber] = 0;
    } else {
      for (const h of holeInfos) { strokesA[h.holeNumber] = 0; strokesB[h.holeNumber] = 0; }
    }

    res.json({
      matchup: m,
      week,
      course,
      holes,
      teamA: {
        ...teamA,
        captain: playerById(teamA.captainId),
        mate: playerById(teamA.mateId),
        handicap: aHcp,
        scores: aMap,
        strokesByHole: strokesA,
      },
      teamB: {
        ...teamB,
        captain: playerById(teamB.captainId),
        mate: playerById(teamB.mateId),
        handicap: bHcp,
        scores: bMap,
        strokesByHole: strokesB,
      },
    });
  });

  // Per-team scratch toggle (sub played — team plays no-handicap and the
  // round is excluded from their season handicap). Admin only.
  app.patch("/api/matchups/:id/scratch", requireAdmin, (req, res) => {
    const matchupId = Number(req.params.id);
    const m = storage.getMatchup(matchupId);
    if (!m) return res.status(404).json({ message: "Matchup not found" });
    const body = req.body ?? {};
    const patch: Partial<{ teamAScratch: boolean; teamBScratch: boolean }> = {};
    if (typeof body.teamAScratch === "boolean") patch.teamAScratch = body.teamAScratch;
    if (typeof body.teamBScratch === "boolean") patch.teamBScratch = body.teamBScratch;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "Provide teamAScratch and/or teamBScratch (boolean)." });
    }
    const updated = storage.updateMatchup(matchupId, patch);
    // Recompute from this week forward — future weeks' rolling handicaps depend
    // on whether this round contributed a differential.
    storage.recomputeFromWeek(m.weekId);
    res.json(updated);
  });

  // Save scores for both teams in a single matchup. Permission: admin OR
  // captain/mate of EITHER team in this matchup.
  app.post("/api/matchups/:id/scores", requireAuth, (req: AuthedRequest, res) => {
    const matchupId = Number(req.params.id);
    const m = storage.getMatchup(matchupId);
    if (!m) return res.status(404).json({ message: "Matchup not found" });

    function userOnEitherTeam(): boolean {
      if (req.userRole === "admin") return true;
      const u = storage.getUser(req.userId!);
      if (!u || !u.playerId) return false;
      const ta = storage.getTeam(m!.teamAId);
      const tb = storage.getTeam(m!.teamBId);
      const onA = ta && (ta.captainId === u.playerId || ta.mateId === u.playerId);
      const onB = tb && (tb.captainId === u.playerId || tb.mateId === u.playerId);
      return Boolean(onA || onB);
    }
    if (!userOnEitherTeam()) {
      return res.status(403).json({ message: "Not allowed to enter scores for this matchup" });
    }

    // Both arrays are 9 elements. Each element is either a number (1..15) or null
    // to leave that hole unset (or clear an entry).
    const slot = z.union([z.number().int().min(1).max(15), z.null()]);
    const schema = z.object({
      teamA: z.array(slot).length(9),
      teamB: z.array(slot).length(9),
    });
    const { teamA, teamB } = schema.parse(req.body);

    function applyTeam(teamId: number, holes: (number | null)[]) {
      for (let i = 0; i < 9; i++) {
        const v = holes[i];
        if (v == null) {
          storage.deleteTeamScore(m!.weekId, teamId, i + 1);
        } else {
          storage.upsertTeamScore({
            weekId: m!.weekId, teamId, holeNumber: i + 1, strokes: v,
          });
        }
      }
    }
    applyTeam(m.teamAId, teamA);
    applyTeam(m.teamBId, teamB);
    storage.recomputeFromWeek(m.weekId);
    res.json({ ok: true });
  });

  // ===== Admin: force a full recompute from week 1 forward =====
  // Useful after a rules/logic change to rebuild handicaps, points, and skins
  // rows for every existing week. Idempotent.
  app.post("/api/admin/recompute", requireAdmin, (_req, res) => {
    const weeks = storage.listWeeks();
    if (weeks.length === 0) return res.json({ ok: true, weeksProcessed: 0 });
    const earliest = weeks.sort((a, b) => a.weekNumber - b.weekNumber)[0];
    storage.recomputeFromWeek(earliest.id);
    res.json({ ok: true, weeksProcessed: weeks.length });
  });

  // ===== Settings =====
  app.get("/api/settings", (_req, res) => res.json(storage.getSettings()));
  app.patch("/api/settings", requireAdmin, (req, res) => {
    const schema = z.object({
      pointsPerHoleWin: z.number().optional(),
      pointsPerHoleTie: z.number().optional(),
      pointsForMatchWin: z.number().optional(),
      holeMaxStrokes: z.number().int().optional(),
      handicapFactor: z.number().optional(),
      handicapRules: z.string().optional(),
      skinsScope: z.enum(["league", "matchup"]).optional(),
      guestViewing: z.boolean().optional(),
      teamHandicapFormula: z.enum(["sum", "avg"]).optional(),
      skinsPotPerWeek: z.number().nonnegative().optional(),
    });
    const data = schema.parse(req.body);
    const updated = storage.updateSettings(data);
    const weeks = storage.listWeeks();
    if (weeks.length > 0) storage.recomputeFromWeek(weeks[0].id);
    res.json(updated);
  });

  // ===== Skins payouts (season-wide) =====
  app.get("/api/skins/payouts", (_req, res) => {
    const cfg = storage.getSettings();
    const allSkins = storage.listSkins();
    const allWeeks = storage.listWeeks();
    const summary = computePayouts(
      allWeeks.map(w => ({ id: w.id, weekNumber: w.weekNumber })),
      allSkins.map(s => ({ weekId: s.weekId, holeNumber: s.holeNumber, teamId: s.teamId, carryoverCount: s.carryoverCount })),
      cfg.skinsPotPerWeek,
    );
    const teams = storage.listTeams();
    const teamMap: Record<number, string> = {};
    for (const t of teams) teamMap[t.id] = t.name;
    res.json({
      potPerWeek: cfg.skinsPotPerWeek,
      currentRollover: summary.currentRollover,
      byWeek: summary.byWeek.map(w => ({
        ...w,
        payouts: Object.entries(w.payouts).map(([tid, amount]) => ({
          teamId: Number(tid), teamName: teamMap[Number(tid)] || "?", amount,
        })),
      })),
      totalByTeam: Object.entries(summary.totalByTeam).map(([tid, amount]) => ({
        teamId: Number(tid), teamName: teamMap[Number(tid)] || "?", amount,
      })).sort((a, b) => b.amount - a.amount),
    });
  });

  // ===== Leaderboard =====
  app.get("/api/leaderboard", (req, res) => {
    const teams = storage.listTeams();
    const players = storage.listPlayers();
    const playerMap: Record<number, any> = {};
    for (const p of players) playerMap[p.id] = p;
    const allMatchups = storage.listMatchups();
    const allSkins = storage.listSkins();
    const allWeeks = storage.listWeeks().sort((a, b) => a.weekNumber - b.weekNumber);
    const cfg = storage.getSettings();
    const payoutSummary = computePayouts(
      allWeeks.map(w => ({ id: w.id, weekNumber: w.weekNumber })),
      allSkins.map(s => ({ weekId: s.weekId, holeNumber: s.holeNumber, teamId: s.teamId, carryoverCount: s.carryoverCount })),
      cfg.skinsPotPerWeek,
    );

    const filter = req.query.week as string | undefined;
    const targetWeekId = filter && filter !== "all" ? Number(filter) : null;

    const lastPlayedWeek = allWeeks
      .filter(w => allMatchups.some(m => m.weekId === w.id && m.teamAPoints != null))
      .sort((a, b) => b.weekNumber - a.weekNumber)[0];

    const standings = teams.map(t => {
      let totalPts = 0;
      let lastWeekPts = 0;
      let skinCount = 0;
      const matchupsForFilter = targetWeekId
        ? allMatchups.filter(m => m.weekId === targetWeekId)
        : allMatchups;
      for (const m of matchupsForFilter) {
        if (m.teamAPoints == null || m.teamBPoints == null) continue;
        if (m.teamAId === t.id) totalPts += m.teamAPoints;
        else if (m.teamBId === t.id) totalPts += m.teamBPoints;
      }
      if (lastPlayedWeek) {
        for (const m of allMatchups) {
          if (m.weekId !== lastPlayedWeek.id) continue;
          if (m.teamAPoints == null || m.teamBPoints == null) continue;
          if (m.teamAId === t.id) lastWeekPts += m.teamAPoints;
          else if (m.teamBId === t.id) lastWeekPts += m.teamBPoints;
        }
      }
      const skinFilter = targetWeekId ? allSkins.filter(s => s.weekId === targetWeekId) : allSkins;
      // Track which holes this team won skins on (single-week view only). For
      // back-9 layouts, holes are stored as 1–9 internally but should display
      // as 10–18 to the user.
      const skinsHoles: number[] = [];
      let weekIsBack = false;
      if (targetWeekId) {
        const tw = allWeeks.find(w => w.id === targetWeekId);
        if (tw) {
          const c = storage.getCourse(tw.courseId);
          weekIsBack = c?.layout === "back";
        }
      }
      for (const s of skinFilter) {
        if (s.teamId != null && s.teamId === t.id) {
          skinCount += s.carryoverCount;
          if (targetWeekId) {
            skinsHoles.push(weekIsBack ? s.holeNumber + 9 : s.holeNumber);
          }
        }
      }
      skinsHoles.sort((a, b) => a - b);
      const cap = playerMap[t.captainId];
      const mate = playerMap[t.mateId];
      const teamH = t.currentHandicap ?? 0;
      // Skins money: season-total when no week filter, single-week amount when filtered.
      let skinsMoney = 0;
      if (targetWeekId) {
        const wp = payoutSummary.byWeek.find(w => w.weekId === targetWeekId);
        if (wp) skinsMoney = wp.payouts[t.id] || 0;
      } else {
        skinsMoney = payoutSummary.totalByTeam[t.id] || 0;
      }
      return {
        teamId: t.id,
        teamName: t.name,
        captainName: cap ? `${cap.firstName} ${cap.lastName}` : "?",
        mateName: mate ? `${mate.firstName} ${mate.lastName}` : "?",
        teamHandicap: Math.round(teamH * 10) / 10,
        totalPoints: totalPts,
        lastWeekPoints: lastWeekPts,
        skinsWon: skinCount,
        skinsHoles, // populated only when filtering to a single week
        skinsMoney: Math.round(skinsMoney * 100) / 100,
      };
    });
    standings.sort((a, b) => b.totalPoints - a.totalPoints || b.skinsWon - a.skinsWon);
    res.json({
      standings,
      lastPlayedWeekId: lastPlayedWeek?.id ?? null,
      potPerWeek: cfg.skinsPotPerWeek,
      currentRollover: payoutSummary.currentRollover,
    });
  });

  // ===== Week results =====
  app.get("/api/weeks/:id/results", (req, res) => {
    const weekId = Number(req.params.id);
    const w = storage.getWeek(weekId);
    if (!w) return res.status(404).json({ message: "Not found" });
    const cfg = storage.getSettings();
    const courseHoles = storage.listHoles(w.courseId);
    const wkMatchups = storage.listMatchups(weekId);
    const wkScores = storage.listTeamScores(weekId);
    const wkSkins = storage.listSkins(weekId);
    const teams = storage.listTeams();
    const teamMap: Record<number, any> = {}; for (const t of teams) teamMap[t.id] = t;
    const players = storage.listPlayers();
    const playerMap: Record<number, any> = {}; for (const p of players) playerMap[p.id] = p;
    const course = storage.getCourse(w.courseId);

    // Group team scores
    const byTeam: Record<number, Record<number, number>> = {};
    for (const s of wkScores) {
      if (!byTeam[s.teamId]) byTeam[s.teamId] = {};
      byTeam[s.teamId][s.holeNumber] = s.strokes;
    }

    const playingHcp = (teamId: number): number => {
      const rows = storage.listTeamHandicapHistory(teamId);
      const allWeeks = storage.listWeeks();
      const wmap: Record<number, any> = {}; for (const x of allWeeks) wmap[x.id] = x;
      let best: { wn: number; v: number } | null = null;
      for (const r of rows) {
        const ww = wmap[r.weekId]; if (!ww) continue;
        if (ww.weekNumber < w.weekNumber) {
          if (!best || ww.weekNumber > best.wn) best = { wn: ww.weekNumber, v: r.handicapAfter };
        }
      }
      return best ? best.v : 0;
    };

    const detailedMatchups = wkMatchups.map(m => {
      const tA = teamMap[m.teamAId]; const tB = teamMap[m.teamBId];
      if (!tA || !tB) return null;
      const fully = (s: Record<number, number>) => s && Object.keys(s).length === 9;
      const a = byTeam[tA.id] || {}; const b = byTeam[tB.id] || {};
      let detail = null;
      if (fully(a) && fully(b)) {
        const scorer = getScorer((w as any).format ?? DEFAULT_FORMAT);
        detail = scorer.compute({
          a: { id: tA.id, kind: "team", strokes: a, handicap: playingHcp(tA.id) },
          b: { id: tB.id, kind: "team", strokes: b, handicap: playingHcp(tB.id) },
          holes: courseHoles.map(h => ({ holeNumber: h.holeNumber, par: h.par, strokeIndex: h.strokeIndex })),
          config: {
            pointsPerHoleWin: cfg.pointsPerHoleWin,
            pointsPerHoleTie: cfg.pointsPerHoleTie,
            pointsForMatchWin: cfg.pointsForMatchWin,
          },
        });
      }
      return {
        id: m.id,
        teamA: {
          id: tA.id, name: tA.name,
          captain: playerMap[tA.captainId], mate: playerMap[tA.mateId],
          scores: a,
          handicap: playingHcp(tA.id),
        },
        teamB: {
          id: tB.id, name: tB.name,
          captain: playerMap[tB.captainId], mate: playerMap[tB.mateId],
          scores: b,
          handicap: playingHcp(tB.id),
        },
        teamAPoints: m.teamAPoints,
        teamBPoints: m.teamBPoints,
        detail,
      };
    }).filter(Boolean);

    // Skins payout for this specific week
    const allSkinsForPayout = storage.listSkins();
    const allWeeksForPayout = storage.listWeeks();
    const payoutAll = computePayouts(
      allWeeksForPayout.map(x => ({ id: x.id, weekNumber: x.weekNumber })),
      allSkinsForPayout.map(s => ({ weekId: s.weekId, holeNumber: s.holeNumber, teamId: s.teamId, carryoverCount: s.carryoverCount })),
      cfg.skinsPotPerWeek,
    );
    const thisWeekPayout = payoutAll.byWeek.find(p => p.weekId === w.id) || null;

    res.json({
      week: w,
      course,
      holes: courseHoles,
      matchups: detailedMatchups,
      skins: wkSkins.map(s => ({
        ...s,
        winnerName: s.teamId ? (teamMap[s.teamId]?.name || null) : null,
      })),
      teamScores: byTeam,
      payout: thisWeekPayout ? {
        potThisWeek: thisWeekPayout.potThisWeek,
        rolloverIn: thisWeekPayout.rolloverIn,
        availablePot: thisWeekPayout.availablePot,
        skinsAwarded: thisWeekPayout.skinsAwarded,
        winningTeams: thisWeekPayout.winningTeams,
        perTeamAmount: Math.round(thisWeekPayout.perTeamAmount * 100) / 100,
        perSkinAmount: Math.round(thisWeekPayout.perSkinAmount * 100) / 100,
        rolloverOut: thisWeekPayout.rolloverOut,
        payouts: Object.entries(thisWeekPayout.payouts).map(([tid, amount]) => ({
          teamId: Number(tid),
          teamName: teamMap[Number(tid)]?.name || "?",
          amount: Math.round(amount * 100) / 100,
        })),
      } : null,
    });
  });

  // Team season stats
  app.get("/api/teams/:id/stats", (req, res) => {
    const tid = Number(req.params.id);
    const allScores = storage.listTeamScores(undefined, tid);
    const weeks = storage.listWeeks();
    const wmap: Record<number, any> = {}; for (const w of weeks) wmap[w.id] = w;
    const allSkins = storage.listSkins();
    const skinsWon = allSkins.filter(s => s.teamId === tid).reduce((a, b) => a + b.carryoverCount, 0);
    const byWeek: Record<number, number[]> = {};
    for (const s of allScores) {
      if (!byWeek[s.weekId]) byWeek[s.weekId] = [];
      byWeek[s.weekId].push(s.strokes);
    }
    const completedWeeks = Object.entries(byWeek).filter(([_, arr]) => arr.length === 9);
    const totals = completedWeeks.map(([wid, arr]) => ({
      weekId: Number(wid),
      total: arr.reduce((a, b) => a + b, 0),
      week: wmap[Number(wid)],
    }));
    const avg = totals.length ? totals.reduce((a, b) => a + b.total, 0) / totals.length : null;
    const ms = storage.listMatchups();
    let teamPoints = 0;
    for (const m of ms) {
      if (m.teamAPoints == null) continue;
      if (m.teamAId === tid) teamPoints += m.teamAPoints;
      else if (m.teamBId === tid) teamPoints += m.teamBPoints!;
    }
    res.json({
      rounds: completedWeeks.length,
      avgScore: avg != null ? Math.round(avg * 10) / 10 : null,
      skinsWon,
      teamPoints,
      rounds_detail: totals.sort((a, b) => (a.week?.weekNumber || 0) - (b.week?.weekNumber || 0)),
    });
  });

  // Player stats stub (kept so the dialog in Players page doesn't break)
  app.get("/api/players/:id/stats", (_req, res) => {
    res.json({
      rounds: 0,
      avgScore: null,
      skinsWon: 0,
      teamPoints: 0,
      rounds_detail: [],
    });
  });

  return httpServer;
}
