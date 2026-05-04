import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------- Users ----------
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"), // 'admin' | 'member'
  playerId: integer("player_id"),
});
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ---------- Players ----------
// NOTE: currentHandicap is DEPRECATED in the team-only scoring model. Kept on the
// schema for backward compat with old data; not read or written by app code anymore.
export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  currentHandicap: real("current_handicap"), // DEPRECATED — handicaps are team-level
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});
export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

// ---------- Teams ----------
export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  captainId: integer("captain_id").notNull(),
  mateId: integer("mate_id").notNull(),
  currentHandicap: real("current_handicap"), // team-level handicap (rolling)
  // Returning teams: admin-entered seed handicap. When a team has no prior
  // differentials (i.e. before week `handicapStartWeek`), this value is used
  // as their playing handicap. Once they have differentials, the rolling
  // formula takes over from this seed.
  startingHandicap: real("starting_handicap"),
  // For new teams that should play at zero (or a fixed seed) for the first
  // few weeks before any handicap is computed. weeks where weekNumber <
  // handicapStartWeek are EXCLUDED from differential history (no posting).
  // Default 1 = handicap applies from week 1 onward (existing behavior).
  handicapStartWeek: integer("handicap_start_week").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// ---------- Courses (each row is a 9-hole layout) ----------
export const courses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  layout: text("layout").notNull(), // 'front' | 'back'
  courseRating: real("course_rating"),
  slope: integer("slope"),
  // Optional link to a catalog course (`golf_courses.id`) when this layout was
  // populated via the Catalog → Apply flow. `startHole` is the catalog hole
  // number that maps to this layout's hole 1 (typically 1 for front, 10 for
  // back). Used by the GPS feature to look up green coordinates.
  catalogCourseId: integer("catalog_course_id"),
  startHole: integer("start_hole"),
});
export const insertCourseSchema = createInsertSchema(courses).omit({ id: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;

// ---------- Holes ----------
export const holes = sqliteTable("holes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id").notNull(),
  holeNumber: integer("hole_number").notNull(), // 1..9
  par: integer("par").notNull(),
  strokeIndex: integer("stroke_index").notNull(), // 1..9
  yards: integer("yards"),
}, (t) => ({
  uniqCourseHole: uniqueIndex("uniq_course_hole").on(t.courseId, t.holeNumber),
}));
export const insertHoleSchema = createInsertSchema(holes).omit({ id: true });
export type InsertHole = z.infer<typeof insertHoleSchema>;
export type Hole = typeof holes.$inferSelect;

// ---------- Weeks ----------
export const weeks = sqliteTable("weeks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekNumber: integer("week_number").notNull(),
  date: text("date").notNull(), // ISO date string
  courseId: integer("course_id").notNull(),
  notes: text("notes"),
});
export const insertWeekSchema = createInsertSchema(weeks).omit({ id: true });
export type InsertWeek = z.infer<typeof insertWeekSchema>;
export type Week = typeof weeks.$inferSelect;

// ---------- Matchups ----------
export const matchups = sqliteTable("matchups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekId: integer("week_id").notNull(),
  teamAId: integer("team_a_id").notNull(),
  teamBId: integer("team_b_id").notNull(),
  teamAPoints: real("team_a_points"),
  teamBPoints: real("team_b_points"),
  // Per-team scratch toggle: when true, that team plays this matchup with no
  // handicap (e.g. a sub played for them). Affects stroke allocation, points,
  // and skins for this matchup only — the team's rolling handicap history is
  // unaffected (the round still posts a differential).
  teamAScratch: integer("team_a_scratch", { mode: "boolean" }).notNull().default(false),
  teamBScratch: integer("team_b_scratch", { mode: "boolean" }).notNull().default(false),
});
export const insertMatchupSchema = createInsertSchema(matchups).omit({ id: true, teamAPoints: true, teamBPoints: true, teamAScratch: true, teamBScratch: true });
export type InsertMatchup = z.infer<typeof insertMatchupSchema>;
export type Matchup = typeof matchups.$inferSelect;

// ---------- Scores (DEPRECATED — per-player; kept for backward compat) ----------
// In the team-only model the active table is `teamScores` below.
export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekId: integer("week_id").notNull(),
  playerId: integer("player_id").notNull(),
  holeNumber: integer("hole_number").notNull(),
  strokes: integer("strokes").notNull(),
}, (t) => ({
  uniqWeekPlayerHole: uniqueIndex("uniq_week_player_hole").on(t.weekId, t.playerId, t.holeNumber),
}));
export const insertScoreSchema = createInsertSchema(scores).omit({ id: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scores.$inferSelect;

// ---------- Team Scores (active scoring table) ----------
export const teamScores = sqliteTable("team_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekId: integer("week_id").notNull(),
  teamId: integer("team_id").notNull(),
  holeNumber: integer("hole_number").notNull(),
  strokes: integer("strokes").notNull(),
}, (t) => ({
  uniqWeekTeamHole: uniqueIndex("uniq_week_team_hole").on(t.weekId, t.teamId, t.holeNumber),
}));
export const insertTeamScoreSchema = createInsertSchema(teamScores).omit({ id: true });
export type InsertTeamScore = z.infer<typeof insertTeamScoreSchema>;
export type TeamScore = typeof teamScores.$inferSelect;

// ---------- Skins ----------
// In the team-only model, `teamId` is the new winner column. `playerId` is
// kept for backward compat with old data but not written by app code anymore.
export const skins = sqliteTable("skins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekId: integer("week_id").notNull(),
  holeNumber: integer("hole_number").notNull(),
  playerId: integer("player_id"), // DEPRECATED — kept for legacy rows
  teamId: integer("team_id"),     // null = carryover, no winner
  carryoverCount: integer("carryover_count").notNull().default(1),
});
export type Skin = typeof skins.$inferSelect;

// ---------- Handicap History (DEPRECATED — per-player; kept for legacy data) ----------
export const handicapHistory = sqliteTable("handicap_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id").notNull(),
  weekId: integer("week_id").notNull(),
  differential: real("differential").notNull(),
  handicapAfter: real("handicap_after").notNull(),
}, (t) => ({
  uniqPlayerWeek: uniqueIndex("uniq_player_week_hcp").on(t.playerId, t.weekId),
}));
export type HandicapHistory = typeof handicapHistory.$inferSelect;

// ---------- Team Handicap History (active) ----------
export const teamHandicapHistory = sqliteTable("team_handicap_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id").notNull(),
  weekId: integer("week_id").notNull(),
  differential: real("differential").notNull(),
  handicapAfter: real("handicap_after").notNull(),
}, (t) => ({
  uniqTeamWeek: uniqueIndex("uniq_team_week_hcp").on(t.teamId, t.weekId),
}));
export type TeamHandicapHistory = typeof teamHandicapHistory.$inferSelect;

// ---------- Settings (singleton id=1) ----------
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  pointsPerHoleWin: real("points_per_hole_win").notNull().default(2),
  pointsPerHoleTie: real("points_per_hole_tie").notNull().default(1),
  pointsForMatchWin: real("points_for_match_win").notNull().default(2),
  holeMaxStrokes: integer("hole_max_strokes").notNull().default(6),
  handicapFactor: real("handicap_factor").notNull().default(0.96),
  // Comma-separated list "best/last" rules per round-count, e.g. "1/1,1/2,1/3,2/4,3/5"
  // index 0 = after 1 round, etc; if rounds > list length use last entry.
  handicapRules: text("handicap_rules").notNull().default("1/1,1/2,1/3,2/4,3/5"),
  skinsScope: text("skins_scope").notNull().default("league"), // 'league' | 'matchup'
  guestViewing: integer("guest_viewing", { mode: "boolean" }).notNull().default(true),
  teamHandicapFormula: text("team_handicap_formula").notNull().default("sum"), // 'sum' | 'avg'
  skinsPotPerWeek: real("skins_pot_per_week").notNull().default(200), // weekly skins pot ($)
});
export type Settings = typeof settings.$inferSelect;

// ---------- Golf Course Catalog ----------
// Cache of courses imported from GolfCourseAPI (golfcourseapi.com).
// Decoupled from the league's per-9 `courses` table above: a catalog course
// represents a real-world course (full 18 holes, multiple tees), and admins
// can "apply" any tee from it to populate one of the league's 9-hole layouts.
export const golfCourses = sqliteTable("golf_courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gcaId: integer("gca_id").notNull().unique(), // GolfCourseAPI numeric id
  clubName: text("club_name").notNull(),
  courseName: text("course_name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  importedAt: integer("imported_at").notNull(), // unix ms
});
export type GolfCourse = typeof golfCourses.$inferSelect;

export const golfCourseTees = sqliteTable("golf_course_tees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  golfCourseId: integer("golf_course_id").notNull(),
  gender: text("gender").notNull(), // 'male' | 'female'
  teeName: text("tee_name").notNull(),
  courseRating: real("course_rating"),
  slopeRating: integer("slope_rating"),
  bogeyRating: real("bogey_rating"),
  totalYards: integer("total_yards"),
  totalMeters: integer("total_meters"),
  numberOfHoles: integer("number_of_holes"),
  parTotal: integer("par_total"),
  frontCourseRating: real("front_course_rating"),
  frontSlopeRating: integer("front_slope_rating"),
  frontBogeyRating: real("front_bogey_rating"),
  backCourseRating: real("back_course_rating"),
  backSlopeRating: integer("back_slope_rating"),
  backBogeyRating: real("back_bogey_rating"),
});
export type GolfCourseTee = typeof golfCourseTees.$inferSelect;

export const golfCourseHoles = sqliteTable("golf_course_holes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teeId: integer("tee_id").notNull(),
  holeNumber: integer("hole_number").notNull(), // 1..18
  par: integer("par").notNull(),
  yardage: integer("yardage"),
  handicap: integer("handicap"),
}, (t) => ({
  uniqTeeHole: uniqueIndex("uniq_tee_hole").on(t.teeId, t.holeNumber),
}));
export type GolfCourseHole = typeof golfCourseHoles.$inferSelect;

// ---------- Course Hole Geo (GPS data per catalog course hole) ----------
// One row per catalog course + hole_number (1..18). Green polygon stored as
// JSON array of {lat,lng}. Source tracks where the data came from so we can
// re-fetch ('osm') vs. preserve manual edits ('manual').
export const courseHoleGeo = sqliteTable("course_hole_geo", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  golfCourseId: integer("golf_course_id").notNull(),
  // 1..18 once assigned; null = imported but not yet assigned to a hole
  // (happens when OSM doesn't tag the green's `ref` and admin needs to
  // assign it manually).
  holeNumber: integer("hole_number"),
  greenLat: real("green_lat"),
  greenLng: real("green_lng"),
  greenPolygonJson: text("green_polygon_json"),
  teeLat: real("tee_lat"),
  teeLng: real("tee_lng"),
  source: text("source").notNull().default("osm"), // 'osm' | 'manual'
  osmWayId: integer("osm_way_id"),
  updatedAt: integer("updated_at").notNull(),
});
export type CourseHoleGeo = typeof courseHoleGeo.$inferSelect;

// ---------- Sessions ----------
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(), // unix ms
});
export type Session = typeof sessions.$inferSelect;
