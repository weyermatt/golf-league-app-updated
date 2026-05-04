import {
  users, players, teams, courses, holes, weeks, matchups, scores, skins,
  handicapHistory, settings, sessions, teamScores, teamHandicapHistory,
  golfCourses, golfCourseTees, golfCourseHoles, courseHoleGeo,
} from "@shared/schema";
import type {
  User, InsertUser, Player, InsertPlayer, Team, InsertTeam,
  Course, InsertCourse, Hole, InsertHole, Week, InsertWeek,
  Matchup, InsertMatchup, Score, InsertScore, Skin, HandicapHistory, Settings,
  TeamScore, InsertTeamScore, TeamHandicapHistory,
  GolfCourse, GolfCourseTee, GolfCourseHole, CourseHoleGeo,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  adjustedGross, computeDifferential, rollingHandicap, type HandicapSettings,
} from "./lib/handicap";
import { computeMatchup, type HoleInfo, type TeamForScoring, type PointsConfig } from "./lib/scoring";
import { computeSkins, computeSkinsByMatchup } from "./lib/skins";
import type { GolfCourseApiCourse } from "./lib/golfCourseApi";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);
export const rawDb = sqlite;

// ---------- Schema setup ----------
function ensureSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      player_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      current_handicap REAL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      captain_id INTEGER NOT NULL,
      mate_id INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      layout TEXT NOT NULL,
      course_rating REAL,
      slope INTEGER
    );
    CREATE TABLE IF NOT EXISTS holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      hole_number INTEGER NOT NULL,
      par INTEGER NOT NULL,
      stroke_index INTEGER NOT NULL,
      yards INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_course_hole ON holes(course_id, hole_number);
    CREATE TABLE IF NOT EXISTS weeks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_number INTEGER NOT NULL,
      date TEXT NOT NULL,
      course_id INTEGER NOT NULL,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS matchups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER NOT NULL,
      team_a_id INTEGER NOT NULL,
      team_b_id INTEGER NOT NULL,
      team_a_points REAL,
      team_b_points REAL,
      team_a_scratch INTEGER NOT NULL DEFAULT 0,
      team_b_scratch INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      hole_number INTEGER NOT NULL,
      strokes INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_week_player_hole ON scores(week_id, player_id, hole_number);
    CREATE TABLE IF NOT EXISTS team_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      hole_number INTEGER NOT NULL,
      strokes INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_week_team_hole ON team_scores(week_id, team_id, hole_number);
    CREATE TABLE IF NOT EXISTS skins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_id INTEGER NOT NULL,
      hole_number INTEGER NOT NULL,
      player_id INTEGER,
      carryover_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS handicap_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      week_id INTEGER NOT NULL,
      differential REAL NOT NULL,
      handicap_after REAL NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_player_week_hcp ON handicap_history(player_id, week_id);
    CREATE TABLE IF NOT EXISTS team_handicap_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      week_id INTEGER NOT NULL,
      differential REAL NOT NULL,
      handicap_after REAL NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_team_week_hcp ON team_handicap_history(team_id, week_id);
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      points_per_hole_win REAL NOT NULL DEFAULT 2,
      points_per_hole_tie REAL NOT NULL DEFAULT 1,
      points_for_match_win REAL NOT NULL DEFAULT 2,
      hole_max_strokes INTEGER NOT NULL DEFAULT 6,
      handicap_factor REAL NOT NULL DEFAULT 0.96,
      handicap_rules TEXT NOT NULL DEFAULT '1/1,1/2,1/3,2/4,3/5',
      skins_scope TEXT NOT NULL DEFAULT 'league',
      guest_viewing INTEGER NOT NULL DEFAULT 1,
      team_handicap_formula TEXT NOT NULL DEFAULT 'sum',
      skins_pot_per_week REAL NOT NULL DEFAULT 200
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS golf_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gca_id INTEGER NOT NULL UNIQUE,
      club_name TEXT NOT NULL,
      course_name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      imported_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS golf_course_tees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      golf_course_id INTEGER NOT NULL,
      gender TEXT NOT NULL,
      tee_name TEXT NOT NULL,
      course_rating REAL,
      slope_rating INTEGER,
      bogey_rating REAL,
      total_yards INTEGER,
      total_meters INTEGER,
      number_of_holes INTEGER,
      par_total INTEGER,
      front_course_rating REAL,
      front_slope_rating INTEGER,
      front_bogey_rating REAL,
      back_course_rating REAL,
      back_slope_rating INTEGER,
      back_bogey_rating REAL
    );
    CREATE TABLE IF NOT EXISTS golf_course_holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tee_id INTEGER NOT NULL,
      hole_number INTEGER NOT NULL,
      par INTEGER NOT NULL,
      yardage INTEGER,
      handicap INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_tee_hole ON golf_course_holes(tee_id, hole_number);
    CREATE TABLE IF NOT EXISTS course_hole_geo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      golf_course_id INTEGER NOT NULL,
      hole_number INTEGER,
      green_lat REAL,
      green_lng REAL,
      green_polygon_json TEXT,
      tee_lat REAL,
      tee_lng REAL,
      source TEXT NOT NULL DEFAULT 'osm',
      osm_way_id INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_geo_course ON course_hole_geo(golf_course_id);
  `);

  // Idempotent ALTERs for catalog link on courses (added in Phase 1.5).
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(courses)`).all() as { name: string }[];
    if (!cols.some(c => c.name === "catalog_course_id")) {
      sqlite.exec(`ALTER TABLE courses ADD COLUMN catalog_course_id INTEGER`);
    }
    if (!cols.some(c => c.name === "start_hole")) {
      sqlite.exec(`ALTER TABLE courses ADD COLUMN start_hole INTEGER`);
    }
  } catch { /* ignore */ }

  // Idempotent ALTERs for upgrades from older DBs.
  // teams.current_handicap
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(teams)`).all() as { name: string }[];
    if (!cols.some(c => c.name === "current_handicap")) {
      sqlite.exec(`ALTER TABLE teams ADD COLUMN current_handicap REAL`);
    }
  } catch { /* ignore */ }
  // skins.team_id
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(skins)`).all() as { name: string }[];
    if (!cols.some(c => c.name === "team_id")) {
      sqlite.exec(`ALTER TABLE skins ADD COLUMN team_id INTEGER`);
    }
  } catch { /* ignore */ }
  // settings.skins_pot_per_week
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(settings)`).all() as { name: string }[];
    if (!cols.some(c => c.name === "skins_pot_per_week")) {
      sqlite.exec(`ALTER TABLE settings ADD COLUMN skins_pot_per_week REAL NOT NULL DEFAULT 200`);
    }
  } catch { /* ignore */ }
  // matchups.team_a_scratch / team_b_scratch (per-team scratch toggle for subs)
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(matchups)`).all() as { name: string }[];
    if (!cols.some(c => c.name === "team_a_scratch")) {
      sqlite.exec(`ALTER TABLE matchups ADD COLUMN team_a_scratch INTEGER NOT NULL DEFAULT 0`);
    }
    if (!cols.some(c => c.name === "team_b_scratch")) {
      sqlite.exec(`ALTER TABLE matchups ADD COLUMN team_b_scratch INTEGER NOT NULL DEFAULT 0`);
    }
  } catch { /* ignore */ }
  // teams.starting_handicap / handicap_start_week
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(teams)`).all() as { name: string }[];
    if (!cols.some(c => c.name === "starting_handicap")) {
      sqlite.exec(`ALTER TABLE teams ADD COLUMN starting_handicap REAL`);
    }
    if (!cols.some(c => c.name === "handicap_start_week")) {
      sqlite.exec(`ALTER TABLE teams ADD COLUMN handicap_start_week INTEGER NOT NULL DEFAULT 1`);
    }
  } catch { /* ignore */ }
  // One-time normalization: lowercase all stored usernames so login can be
  // case-insensitive without breaking the unique index. If a collision would
  // occur (two users with the same case-insensitive name), we keep the
  // lower-id one and suffix the others with `~<id>` so the admin can sort it
  // out manually rather than silently dropping data.
  try {
    const rows = sqlite.prepare(`SELECT id, username FROM users`).all() as { id: number; username: string }[];
    const seen: Record<string, number> = {};
    for (const r of rows.sort((a, b) => a.id - b.id)) {
      const lower = r.username.toLowerCase();
      if (lower === r.username && !seen[lower]) {
        seen[lower] = r.id;
        continue;
      }
      if (seen[lower] != null) {
        // Collision — suffix this one
        const collided = `${lower}~${r.id}`;
        sqlite.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(collided, r.id);
      } else {
        sqlite.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(lower, r.id);
        seen[lower] = r.id;
      }
    }
  } catch { /* ignore */ }
}
ensureSchema();

// ---------- Seeding ----------
async function seed() {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!s) {
    sqlite.prepare(`INSERT INTO settings (id) VALUES (1)`).run();
  }
  const admin = db.select().from(users).where(eq(users.username, "admin")).get();
  if (!admin) {
    const hash = bcrypt.hashSync("admin123", 10);
    db.insert(users).values({ username: "admin", passwordHash: hash, role: "admin", playerId: null }).run();
  }
  const front = db.select().from(courses).where(eq(courses.layout, "front")).get();
  if (!front) {
    db.insert(courses).values({ name: "Home Course", layout: "front", courseRating: null, slope: null }).run();
  }
  const back = db.select().from(courses).where(eq(courses.layout, "back")).get();
  if (!back) {
    db.insert(courses).values({ name: "Home Course", layout: "back", courseRating: null, slope: null }).run();
  }
}
seed();

// ---------- Storage interface ----------
export class Storage {
  // ---- users ----
  getUser(id: number) { return db.select().from(users).where(eq(users.id, id)).get(); }
  // Case-insensitive username lookup. All usernames are stored lowercase
  // (enforced at create/update time and by the one-time migration in
  // ensureSchema), so a simple lowercase comparison on input is sufficient.
  getUserByUsername(username: string) {
    const u = String(username || "").trim().toLowerCase();
    if (!u) return undefined;
    return db.select().from(users).where(eq(users.username, u)).get();
  }
  listUsers() { return db.select().from(users).all(); }
  createUser(u: InsertUser) {
    const normalized = { ...u, username: String(u.username || "").trim().toLowerCase() };
    return db.insert(users).values(normalized).returning().get();
  }
  updateUser(id: number, patch: Partial<InsertUser>) {
    const normalized: Partial<InsertUser> = { ...patch };
    if (normalized.username != null) {
      normalized.username = String(normalized.username).trim().toLowerCase();
    }
    return db.update(users).set(normalized).where(eq(users.id, id)).returning().get();
  }
  deleteUser(id: number) { return db.delete(users).where(eq(users.id, id)).run(); }
  setPassword(userId: number, password: string) {
    const hash = bcrypt.hashSync(password, 10);
    return db.update(users).set({ passwordHash: hash }).where(eq(users.id, userId)).run();
  }
  verifyPassword(user: User, password: string) {
    return bcrypt.compareSync(password, user.passwordHash);
  }

  // ---- sessions ----
  createSession(id: string, userId: number, expiresAt: number) {
    return db.insert(sessions).values({ id, userId, expiresAt }).run();
  }
  getSession(id: string) {
    const s = db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      db.delete(sessions).where(eq(sessions.id, id)).run();
      return null;
    }
    return s;
  }
  deleteSession(id: string) { return db.delete(sessions).where(eq(sessions.id, id)).run(); }

  // ---- players ----
  listPlayers() { return db.select().from(players).orderBy(asc(players.lastName)).all(); }
  getPlayer(id: number) { return db.select().from(players).where(eq(players.id, id)).get(); }
  createPlayer(p: InsertPlayer) { return db.insert(players).values(p).returning().get(); }
  updatePlayer(id: number, patch: Partial<InsertPlayer>) {
    return db.update(players).set(patch).where(eq(players.id, id)).returning().get();
  }
  deletePlayer(id: number) { return db.delete(players).where(eq(players.id, id)).run(); }

  // ---- teams ----
  listTeams() { return db.select().from(teams).all(); }
  getTeam(id: number) { return db.select().from(teams).where(eq(teams.id, id)).get(); }
  createTeam(t: InsertTeam) { return db.insert(teams).values(t).returning().get(); }
  updateTeam(id: number, patch: Partial<InsertTeam>) {
    return db.update(teams).set(patch).where(eq(teams.id, id)).returning().get();
  }
  deleteTeam(id: number) { return db.delete(teams).where(eq(teams.id, id)).run(); }
  setTeamHandicap(teamId: number, hcp: number | null) {
    return db.update(teams).set({ currentHandicap: hcp }).where(eq(teams.id, teamId)).run();
  }

  // ---- courses ----
  listCourses() { return db.select().from(courses).all(); }
  getCourse(id: number) { return db.select().from(courses).where(eq(courses.id, id)).get(); }
  createCourse(c: InsertCourse) { return db.insert(courses).values(c).returning().get(); }
  updateCourse(id: number, patch: Partial<InsertCourse>) {
    return db.update(courses).set(patch).where(eq(courses.id, id)).returning().get();
  }

  // ---- holes ----
  listHoles(courseId: number) {
    return db.select().from(holes).where(eq(holes.courseId, courseId)).orderBy(asc(holes.holeNumber)).all();
  }
  upsertHole(h: InsertHole) {
    const existing = db.select().from(holes)
      .where(and(eq(holes.courseId, h.courseId), eq(holes.holeNumber, h.holeNumber))).get();
    if (existing) {
      return db.update(holes).set(h).where(eq(holes.id, existing.id)).returning().get();
    }
    return db.insert(holes).values(h).returning().get();
  }

  // ---- weeks ----
  listWeeks() { return db.select().from(weeks).orderBy(asc(weeks.weekNumber)).all(); }
  getWeek(id: number) { return db.select().from(weeks).where(eq(weeks.id, id)).get(); }
  createWeek(w: InsertWeek) { return db.insert(weeks).values(w).returning().get(); }
  updateWeek(id: number, patch: Partial<InsertWeek>) {
    return db.update(weeks).set(patch).where(eq(weeks.id, id)).returning().get();
  }
  deleteWeek(id: number) {
    db.delete(scores).where(eq(scores.weekId, id)).run();
    db.delete(teamScores).where(eq(teamScores.weekId, id)).run();
    db.delete(matchups).where(eq(matchups.weekId, id)).run();
    db.delete(skins).where(eq(skins.weekId, id)).run();
    db.delete(handicapHistory).where(eq(handicapHistory.weekId, id)).run();
    db.delete(teamHandicapHistory).where(eq(teamHandicapHistory.weekId, id)).run();
    return db.delete(weeks).where(eq(weeks.id, id)).run();
  }

  // ---- matchups ----
  listMatchups(weekId?: number) {
    if (weekId != null) return db.select().from(matchups).where(eq(matchups.weekId, weekId)).all();
    return db.select().from(matchups).all();
  }
  getMatchup(id: number) { return db.select().from(matchups).where(eq(matchups.id, id)).get(); }
  createMatchup(m: InsertMatchup) { return db.insert(matchups).values(m).returning().get(); }
  updateMatchup(id: number, patch: Partial<Matchup>) {
    return db.update(matchups).set(patch).where(eq(matchups.id, id)).returning().get();
  }
  deleteMatchup(id: number) { return db.delete(matchups).where(eq(matchups.id, id)).run(); }

  // ---- scores (DEPRECATED per-player; kept for legacy reads only) ----
  listScores(weekId?: number, playerId?: number) {
    let q = db.select().from(scores).$dynamic();
    if (weekId != null && playerId != null) q = q.where(and(eq(scores.weekId, weekId), eq(scores.playerId, playerId)));
    else if (weekId != null) q = q.where(eq(scores.weekId, weekId));
    else if (playerId != null) q = q.where(eq(scores.playerId, playerId));
    return q.all();
  }

  // ---- team scores ----
  listTeamScores(weekId?: number, teamId?: number): TeamScore[] {
    let q = db.select().from(teamScores).$dynamic();
    if (weekId != null && teamId != null) q = q.where(and(eq(teamScores.weekId, weekId), eq(teamScores.teamId, teamId)));
    else if (weekId != null) q = q.where(eq(teamScores.weekId, weekId));
    else if (teamId != null) q = q.where(eq(teamScores.teamId, teamId));
    return q.all();
  }
  upsertTeamScore(s: InsertTeamScore) {
    const existing = db.select().from(teamScores)
      .where(and(eq(teamScores.weekId, s.weekId), eq(teamScores.teamId, s.teamId), eq(teamScores.holeNumber, s.holeNumber))).get();
    if (existing) {
      return db.update(teamScores).set({ strokes: s.strokes }).where(eq(teamScores.id, existing.id)).returning().get();
    }
    return db.insert(teamScores).values(s).returning().get();
  }
  bulkUpsertTeamScores(entries: InsertTeamScore[]) {
    for (const e of entries) this.upsertTeamScore(e);
  }
  deleteTeamScoresForWeek(weekId: number, teamId?: number) {
    if (teamId != null) {
      return db.delete(teamScores).where(and(eq(teamScores.weekId, weekId), eq(teamScores.teamId, teamId))).run();
    }
    return db.delete(teamScores).where(eq(teamScores.weekId, weekId)).run();
  }
  deleteTeamScore(weekId: number, teamId: number, holeNumber: number) {
    return db.delete(teamScores)
      .where(and(
        eq(teamScores.weekId, weekId),
        eq(teamScores.teamId, teamId),
        eq(teamScores.holeNumber, holeNumber),
      ))
      .run();
  }

  // ---- handicap history (DEPRECATED) ----
  listHandicapHistory(playerId?: number) {
    if (playerId != null) return db.select().from(handicapHistory).where(eq(handicapHistory.playerId, playerId)).all();
    return db.select().from(handicapHistory).all();
  }

  // ---- team handicap history ----
  listTeamHandicapHistory(teamId?: number): TeamHandicapHistory[] {
    if (teamId != null) return db.select().from(teamHandicapHistory).where(eq(teamHandicapHistory.teamId, teamId)).all();
    return db.select().from(teamHandicapHistory).all();
  }

  // ---- skins ----
  listSkins(weekId?: number) {
    if (weekId != null) return db.select().from(skins).where(eq(skins.weekId, weekId)).all();
    return db.select().from(skins).all();
  }

  // ---- settings ----
  getSettings(): Settings {
    const s = db.select().from(settings).where(eq(settings.id, 1)).get();
    if (!s) {
      sqlite.prepare(`INSERT INTO settings (id) VALUES (1)`).run();
      return db.select().from(settings).where(eq(settings.id, 1)).get()!;
    }
    return s;
  }
  updateSettings(patch: Partial<Settings>) {
    return db.update(settings).set(patch).where(eq(settings.id, 1)).returning().get();
  }

  // ---- golf course catalog ----
  listGolfCourses(): GolfCourse[] {
    return db.select().from(golfCourses).orderBy(asc(golfCourses.clubName)).all();
  }
  getGolfCourse(id: number): GolfCourse | undefined {
    return db.select().from(golfCourses).where(eq(golfCourses.id, id)).get();
  }
  getGolfCourseByGcaId(gcaId: number): GolfCourse | undefined {
    return db.select().from(golfCourses).where(eq(golfCourses.gcaId, gcaId)).get();
  }
  listGolfCourseTees(golfCourseId: number): GolfCourseTee[] {
    return db.select().from(golfCourseTees).where(eq(golfCourseTees.golfCourseId, golfCourseId)).all();
  }
  getGolfCourseTee(id: number): GolfCourseTee | undefined {
    return db.select().from(golfCourseTees).where(eq(golfCourseTees.id, id)).get();
  }
  listGolfCourseHoles(teeId: number): GolfCourseHole[] {
    return db.select().from(golfCourseHoles)
      .where(eq(golfCourseHoles.teeId, teeId))
      .orderBy(asc(golfCourseHoles.holeNumber)).all();
  }

  /** Import a course payload returned by GolfCourseAPI (`GET /v1/courses/{id}`).
   *  Idempotent: re-importing the same gca_id replaces tees + holes for that course. */
  importGolfCourse(payload: GolfCourseApiCourse): GolfCourse {
    return sqlite.transaction(() => {
      const existing = this.getGolfCourseByGcaId(payload.id);
      const loc = payload.location || {};
      const courseRow = {
        gcaId: payload.id,
        clubName: payload.club_name,
        courseName: payload.course_name,
        address: loc.address ?? null,
        city: loc.city ?? null,
        state: loc.state ?? null,
        country: loc.country ?? null,
        latitude: loc.latitude ?? null,
        longitude: loc.longitude ?? null,
        importedAt: Date.now(),
      };
      let savedId: number;
      if (existing) {
        db.update(golfCourses).set(courseRow).where(eq(golfCourses.id, existing.id)).run();
        savedId = existing.id;
        // wipe old tees/holes
        const oldTees = db.select().from(golfCourseTees).where(eq(golfCourseTees.golfCourseId, savedId)).all();
        for (const t of oldTees) {
          db.delete(golfCourseHoles).where(eq(golfCourseHoles.teeId, t.id)).run();
        }
        db.delete(golfCourseTees).where(eq(golfCourseTees.golfCourseId, savedId)).run();
      } else {
        const inserted = db.insert(golfCourses).values(courseRow).returning().get();
        savedId = inserted.id;
      }
      const tees = payload.tees || {};
      for (const gender of ["male", "female"] as const) {
        const arr = tees[gender] || [];
        for (const t of arr) {
          const teeInsert = db.insert(golfCourseTees).values({
            golfCourseId: savedId,
            gender,
            teeName: t.tee_name ?? "Unnamed",
            courseRating: t.course_rating ?? null,
            slopeRating: t.slope_rating ?? null,
            bogeyRating: t.bogey_rating ?? null,
            totalYards: t.total_yards ?? null,
            totalMeters: t.total_meters ?? null,
            numberOfHoles: t.number_of_holes ?? null,
            parTotal: t.par_total ?? null,
            frontCourseRating: t.front_course_rating ?? null,
            frontSlopeRating: t.front_slope_rating ?? null,
            frontBogeyRating: t.front_bogey_rating ?? null,
            backCourseRating: t.back_course_rating ?? null,
            backSlopeRating: t.back_slope_rating ?? null,
            backBogeyRating: t.back_bogey_rating ?? null,
          }).returning().get();
          const teeId = teeInsert.id;
          const holesArr = t.holes || [];
          holesArr.forEach((h, i) => {
            db.insert(golfCourseHoles).values({
              teeId,
              holeNumber: i + 1,
              par: h.par ?? 4,
              yardage: h.yardage ?? null,
              handicap: h.handicap ?? null,
            }).run();
          });
        }
      }
      return this.getGolfCourse(savedId)!;
    })();
  }

  // ---- course hole geo ----
  listCourseHoleGeo(golfCourseId: number): CourseHoleGeo[] {
    return db.select().from(courseHoleGeo)
      .where(eq(courseHoleGeo.golfCourseId, golfCourseId))
      .orderBy(asc(courseHoleGeo.holeNumber)).all();
  }
  getCourseHoleGeoForHole(golfCourseId: number, holeNumber: number): CourseHoleGeo | undefined {
    return db.select().from(courseHoleGeo)
      .where(and(eq(courseHoleGeo.golfCourseId, golfCourseId), eq(courseHoleGeo.holeNumber, holeNumber)))
      .get();
  }
  upsertCourseHoleGeo(row: {
    golfCourseId: number;
    holeNumber: number | null;
    greenLat: number | null;
    greenLng: number | null;
    greenPolygonJson: string | null;
    teeLat?: number | null;
    teeLng?: number | null;
    source: "osm" | "manual";
    osmWayId?: number | null;
  }): CourseHoleGeo {
    // Dedup logic:
    //   - osm: dedupe by osm_way_id within the same course
    //   - manual: dedupe by (course, hole_number)
    const now = Date.now();
    let existing: CourseHoleGeo | undefined;
    if (row.source === "osm" && row.osmWayId != null) {
      existing = db.select().from(courseHoleGeo)
        .where(and(eq(courseHoleGeo.golfCourseId, row.golfCourseId), eq(courseHoleGeo.osmWayId, row.osmWayId)))
        .get();
    } else if (row.holeNumber != null) {
      existing = db.select().from(courseHoleGeo)
        .where(and(eq(courseHoleGeo.golfCourseId, row.golfCourseId), eq(courseHoleGeo.holeNumber, row.holeNumber)))
        .get();
    }
    if (existing) {
      return db.update(courseHoleGeo).set({
        holeNumber: row.holeNumber,
        greenLat: row.greenLat,
        greenLng: row.greenLng,
        greenPolygonJson: row.greenPolygonJson,
        teeLat: row.teeLat ?? null,
        teeLng: row.teeLng ?? null,
        source: row.source,
        osmWayId: row.osmWayId ?? null,
        updatedAt: now,
      }).where(eq(courseHoleGeo.id, existing.id)).returning().get();
    }
    return db.insert(courseHoleGeo).values({
      golfCourseId: row.golfCourseId,
      holeNumber: row.holeNumber,
      greenLat: row.greenLat,
      greenLng: row.greenLng,
      greenPolygonJson: row.greenPolygonJson,
      teeLat: row.teeLat ?? null,
      teeLng: row.teeLng ?? null,
      source: row.source,
      osmWayId: row.osmWayId ?? null,
      updatedAt: now,
    }).returning().get();
  }
  deleteCourseHoleGeo(id: number) {
    return db.delete(courseHoleGeo).where(eq(courseHoleGeo.id, id)).run();
  }
  /** Reassign which hole a geo row points to. Pass null to "unassign". If
   *  another row already had this hole, that row is unassigned (set to null)
   *  so the (course, hole) relationship stays effectively 1:1 from the UI. */
  reassignCourseHoleGeo(geoId: number, holeNumber: number | null) {
    const row = db.select().from(courseHoleGeo).where(eq(courseHoleGeo.id, geoId)).get();
    if (!row) throw new Error("Geo row not found");
    if (holeNumber != null) {
      const conflict = db.select().from(courseHoleGeo).where(and(
        eq(courseHoleGeo.golfCourseId, row.golfCourseId),
        eq(courseHoleGeo.holeNumber, holeNumber),
      )).get();
      if (conflict && conflict.id !== geoId) {
        db.update(courseHoleGeo).set({ holeNumber: null, updatedAt: Date.now() })
          .where(eq(courseHoleGeo.id, conflict.id)).run();
      }
    }
    return db.update(courseHoleGeo).set({ holeNumber, updatedAt: Date.now() })
      .where(eq(courseHoleGeo.id, geoId)).returning().get();
  }
  clearCourseHoleGeo(golfCourseId: number, source?: "osm" | "manual") {
    if (source) {
      return db.delete(courseHoleGeo)
        .where(and(eq(courseHoleGeo.golfCourseId, golfCourseId), eq(courseHoleGeo.source, source)))
        .run();
    }
    return db.delete(courseHoleGeo).where(eq(courseHoleGeo.golfCourseId, golfCourseId)).run();
  }

  /** Apply a 9-hole slice of a catalog tee onto an existing league `courses` row.
   *  Updates name/rating/slope on the layout, then upserts its 9 holes from
   *  catalog hole [startHole .. startHole+8]. Re-ranks handicaps within the 9
   *  to a 1..9 stroke index (since the catalog stores 1..18). */
  applyCatalogTeeToLayout(args: {
    layoutCourseId: number;
    catalogCourseId: number;
    teeId: number;
    startHole: number; // 1 for front, 10 for back, etc.
  }): { updatedHoles: number } {
    return sqlite.transaction(() => {
      const layout = this.getCourse(args.layoutCourseId);
      if (!layout) throw new Error("Layout course not found");
      const catalog = this.getGolfCourse(args.catalogCourseId);
      if (!catalog) throw new Error("Catalog course not found");
      const tee = this.getGolfCourseTee(args.teeId);
      if (!tee || tee.golfCourseId !== catalog.id) throw new Error("Tee not found on this catalog course");
      const allHoles = this.listGolfCourseHoles(tee.id);
      const slice = allHoles.filter(h => h.holeNumber >= args.startHole && h.holeNumber < args.startHole + 9);
      if (slice.length < 9) throw new Error(`Catalog tee only has ${allHoles.length} holes; cannot start at ${args.startHole}`);

      // Pick 9-hole rating/slope: front/back if matching the slice, else fall back to full course rating.
      let nineRating: number | null = null;
      let nineSlope: number | null = null;
      if (args.startHole === 1) {
        nineRating = tee.frontCourseRating ?? (tee.courseRating != null ? tee.courseRating / 2 : null);
        nineSlope = tee.frontSlopeRating ?? tee.slopeRating ?? null;
      } else if (args.startHole === 10) {
        nineRating = tee.backCourseRating ?? (tee.courseRating != null ? tee.courseRating / 2 : null);
        nineSlope = tee.backSlopeRating ?? tee.slopeRating ?? null;
      } else {
        nineRating = tee.courseRating != null ? tee.courseRating / 2 : null;
        nineSlope = tee.slopeRating ?? null;
      }

      // Re-rank stroke indexes within the slice from the catalog handicaps (lower = harder).
      // If a hole has no handicap value, fall back to its position in the slice.
      const ranked = slice
        .map((h, idx) => ({ h, idx, hcp: h.handicap ?? 100 + idx }))
        .sort((a, b) => a.hcp - b.hcp)
        .map((row, rank) => ({ holeNumber: row.h.holeNumber, strokeIndex: rank + 1 }));
      const siByHole: Record<number, number> = {};
      for (const r of ranked) siByHole[r.holeNumber] = r.strokeIndex;

      // Update layout course metadata (name reflects catalog choice).
      const layoutLabel = layout.layout === "front" ? "Front" :
                          layout.layout === "back" ? "Back" : "Custom";
      const newName = `${catalog.clubName} — ${catalog.courseName} (${tee.teeName}) — ${layoutLabel} 9`;
      db.update(courses).set({
        name: newName,
        courseRating: nineRating,
        slope: nineSlope,
        catalogCourseId: catalog.id,
        startHole: args.startHole,
      }).where(eq(courses.id, args.layoutCourseId)).run();

      // Upsert the 9 holes into the layout (holeNumber 1..9 within the layout).
      let i = 1;
      for (const h of slice) {
        this.upsertHole({
          courseId: args.layoutCourseId,
          holeNumber: i,
          par: h.par,
          strokeIndex: siByHole[h.holeNumber] ?? i,
          yards: h.yardage ?? null,
        });
        i++;
      }

      // Recompute affected weeks (handicap differentials depend on rating/slope/par).
      const affected = this.listWeeks().filter(w => w.courseId === args.layoutCourseId);
      if (affected.length > 0) {
        const earliest = affected.reduce((a, b) => a.weekNumber < b.weekNumber ? a : b);
        this.recomputeFromWeek(earliest.id);
      }
      return { updatedHoles: 9 };
    })();
  }

  // =====================================================
  // RECOMPUTE PIPELINE (team-only)
  // =====================================================

  /** Recompute everything from a starting week onwards (inclusive).
   *  Triggered after any team-score insert/update/delete or settings change.
   */
  recomputeFromWeek(startWeekId: number) {
    const startWeek = this.getWeek(startWeekId);
    if (!startWeek) return;
    const allWeeks = this.listWeeks().filter(w => w.weekNumber >= startWeek.weekNumber);
    sqlite.transaction(() => {
      // Wipe team handicap history & skins & matchup point cols for affected weeks
      for (const w of allWeeks) {
        db.delete(teamHandicapHistory).where(eq(teamHandicapHistory.weekId, w.id)).run();
        db.delete(skins).where(eq(skins.weekId, w.id)).run();
        db.update(matchups).set({ teamAPoints: null, teamBPoints: null })
          .where(eq(matchups.weekId, w.id)).run();
      }
      // Recompute each affected week in order
      for (const w of allWeeks) {
        this.recomputeWeek(w.id);
      }
      // Update each team's currentHandicap from latest history row
      const allTeams = this.listTeams();
      const wmap: Record<number, Week> = {};
      for (const ww of this.listWeeks()) wmap[ww.id] = ww;
      for (const t of allTeams) {
        const hist = db.select().from(teamHandicapHistory)
          .where(eq(teamHandicapHistory.teamId, t.id)).all();
        if (hist.length === 0) {
          // No rounds yet — fall back to the team's seed (startingHandicap)
          // so the displayed "current" hcp matches what they'll play with.
          db.update(teams).set({ currentHandicap: t.startingHandicap ?? null }).where(eq(teams.id, t.id)).run();
        } else {
          hist.sort((a, b) => (wmap[a.weekId]?.weekNumber || 0) - (wmap[b.weekId]?.weekNumber || 0));
          const latest = hist[hist.length - 1].handicapAfter;
          db.update(teams).set({ currentHandicap: latest }).where(eq(teams.id, t.id)).run();
        }
      }
    })();
  }

  /** Recompute a single week assuming prior weeks already have team_handicap_history rows. */
  recomputeWeek(weekId: number) {
    const w = this.getWeek(weekId);
    if (!w) return;
    const cfg = this.getSettings();
    const courseHoles = this.listHoles(w.courseId);
    if (courseHoles.length === 0) return; // no course setup yet
    const par9 = courseHoles.reduce((s, h) => s + h.par, 0);
    const course = this.getCourse(w.courseId)!;
    const wkScores = db.select().from(teamScores).where(eq(teamScores.weekId, w.id)).all();

    // group scores by team
    const byTeam: Record<number, Record<number, number>> = {};
    for (const s of wkScores) {
      if (!byTeam[s.teamId]) byTeam[s.teamId] = {};
      byTeam[s.teamId][s.holeNumber] = s.strokes;
    }

    // 1) Compute differential & rolling handicap for each team that has all 9 holes
    const hcpSettings: HandicapSettings = {
      holeMaxStrokes: cfg.holeMaxStrokes,
      handicapFactor: cfg.handicapFactor,
      handicapRules: cfg.handicapRules,
    };
    const allWeeks = this.listWeeks().sort((a, b) => a.weekNumber - b.weekNumber);
    const priorWeekIds = allWeeks.filter(x => x.weekNumber < w.weekNumber).map(x => x.id);

    // Build a set of teams that played scratch (sub) in this week's matchups.
    // Such rounds are EXCLUDED from rolling handicap entirely — no differential
    // is posted, so the team's season handicap is unaffected.
    const wkMatchupsForScratch = db.select().from(matchups).where(eq(matchups.weekId, w.id)).all();
    const scratchTeams = new Set<number>();
    for (const m of wkMatchupsForScratch) {
      if (m.teamAScratch) scratchTeams.add(m.teamAId);
      if (m.teamBScratch) scratchTeams.add(m.teamBId);
    }

    // Build per-team handicap-start-week map. Teams with weekNumber <
    // their handicapStartWeek do NOT post a differential and play with no
    // computed handicap (they may still use startingHandicap as their seed,
    // but seeded teams typically have startingHandicap=0 + handicapStartWeek=4
    // for genuinely new teams, while returning teams use startingHandicap=X +
    // handicapStartWeek=1 to begin rolling immediately).
    const teamsList = this.listTeams();
    const teamMap: Record<number, typeof teamsList[number]> = {};
    for (const t of teamsList) teamMap[t.id] = t;
    const startWeekFor = (tid: number) => teamMap[tid]?.handicapStartWeek ?? 1;

    const teamsWithFullScore = Object.keys(byTeam)
      .map(Number)
      .filter(tid => Object.keys(byTeam[tid]).length === 9)
      .filter(tid => !scratchTeams.has(tid))
      // Skip differential posting if team's handicap hasn't "started" yet.
      .filter(tid => w.weekNumber >= startWeekFor(tid));

    for (const tid of teamsWithFullScore) {
      const teamHoles = courseHoles.map(h => ({
        holeNumber: h.holeNumber,
        par: h.par,
        strokes: byTeam[tid][h.holeNumber],
      }));
      // 6-stroke max per hole cap is applied here for handicap purposes only
      const adj = adjustedGross(teamHoles, cfg.holeMaxStrokes);
      const diff = computeDifferential(adj, {
        par9,
        courseRating: course.courseRating ?? null,
        slope: course.slope ?? null,
      });
      // Get prior differentials in chronological order
      const priorDiffs: number[] = [];
      for (const pwid of priorWeekIds) {
        const h = db.select().from(teamHandicapHistory)
          .where(and(eq(teamHandicapHistory.teamId, tid), eq(teamHandicapHistory.weekId, pwid))).get();
        if (h) priorDiffs.push(h.differential);
      }
      priorDiffs.push(diff);
      const newHcp = rollingHandicap(priorDiffs, hcpSettings) ?? 0;
      db.insert(teamHandicapHistory).values({
        teamId: tid, weekId: w.id, differential: diff, handicapAfter: newHcp,
      }).run();
    }

    // 2) Compute matchup points
    const wkMatchups = db.select().from(matchups).where(eq(matchups.weekId, w.id)).all();

    const pointsCfg: PointsConfig = {
      pointsPerHoleWin: cfg.pointsPerHoleWin,
      pointsPerHoleTie: cfg.pointsPerHoleTie,
      pointsForMatchWin: cfg.pointsForMatchWin,
    };
    const holeInfos: HoleInfo[] = courseHoles.map(h => ({
      holeNumber: h.holeNumber, par: h.par, strokeIndex: h.strokeIndex,
    }));

    const playingHcp = (teamId: number): number => {
      const team = teamMap[teamId];
      // If the team's handicap hasn't started yet for this week, they play
      // scratch (0). The startingHandicap seed is reserved for week >=
      // handicapStartWeek as a fallback when no prior differentials exist.
      // This lets all teams play raw in pre-start weeks (e.g. set
      // handicapStartWeek=2 league-wide so week 1 is scratch for everyone),
      // while still using the seed as the active handicap from the start
      // week onward until enough rounds accumulate to roll.
      if (team && w.weekNumber < (team.handicapStartWeek ?? 1)) {
        return 0;
      }
      // most recent team_handicap_history row with weekNumber < this week's
      let best: { wn: number; v: number } | null = null;
      const rows = db.select().from(teamHandicapHistory).where(eq(teamHandicapHistory.teamId, teamId)).all();
      for (const r of rows) {
        const wk = this.getWeek(r.weekId);
        if (!wk) continue;
        if (wk.weekNumber < w.weekNumber) {
          if (!best || wk.weekNumber > best.wn) best = { wn: wk.weekNumber, v: r.handicapAfter };
        }
      }
      // No prior differentials: use the team's seed (startingHandicap) if set.
      // This is how returning teams play with last year's handicap from week 1.
      if (!best) return team?.startingHandicap ?? 0;
      return best.v;
    };

    for (const m of wkMatchups) {
      const aScores = byTeam[m.teamAId] || {};
      const bScores = byTeam[m.teamBId] || {};
      const fully = (s: Record<number, number>) => Object.keys(s).length === 9;
      if (!fully(aScores) || !fully(bScores)) continue;
      // Per-team scratch override: if a team played with a sub this matchup,
      // their playing handicap for points calc is 0 (raw vs. raw).
      const aHcp = m.teamAScratch ? 0 : playingHcp(m.teamAId);
      const bHcp = m.teamBScratch ? 0 : playingHcp(m.teamBId);
      const result = computeMatchup(
        { teamId: m.teamAId, strokes: aScores, handicap: aHcp },
        { teamId: m.teamBId, strokes: bScores, handicap: bHcp },
        holeInfos,
        pointsCfg,
      );
      db.update(matchups).set({
        teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints,
      }).where(eq(matchups.id, m.id)).run();
    }

    // 3) Compute skins (per team)
    const flatScores = wkScores.map(s => ({
      teamId: s.teamId, holeNumber: s.holeNumber, strokes: s.strokes,
    }));
    let skinResults;
    if (cfg.skinsScope === "matchup") {
      const ms = wkMatchups.map(m => ({ teamAId: m.teamAId, teamBId: m.teamBId }));
      skinResults = computeSkinsByMatchup(flatScores, ms);
    } else {
      const field = new Set<number>(Object.keys(byTeam).map(Number));
      skinResults = computeSkins(flatScores, field);
    }
    for (const sr of skinResults) {
      db.insert(skins).values({
        weekId: w.id,
        holeNumber: sr.holeNumber,
        teamId: sr.teamId,
        playerId: null,
        carryoverCount: sr.carryoverCount,
      }).run();
    }
  }
}

export const storage = new Storage();
