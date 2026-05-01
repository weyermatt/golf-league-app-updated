// One-time loader for The Links at Erie Village (Blue tees).
// Source: 18Birdies / GolfPass scorecard, reconciled via 18Birdies.
import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "data.db");
const db = new Database(dbPath);

// Front 9 (Blue): par 4-5-4-4-4-3-5-4-3 = 36
// Within-9 stroke index derived from overall HCP 11,1,15,5,3,17,7,9,13
const front = [
  { holeNumber: 1, par: 4, strokeIndex: 5, yards: 394 },
  { holeNumber: 2, par: 5, strokeIndex: 1, yards: 607 },
  { holeNumber: 3, par: 4, strokeIndex: 8, yards: 342 },
  { holeNumber: 4, par: 4, strokeIndex: 3, yards: 353 },
  { holeNumber: 5, par: 4, strokeIndex: 2, yards: 424 },
  { holeNumber: 6, par: 3, strokeIndex: 9, yards: 181 },
  { holeNumber: 7, par: 5, strokeIndex: 4, yards: 517 },
  { holeNumber: 8, par: 4, strokeIndex: 6, yards: 401 },
  { holeNumber: 9, par: 3, strokeIndex: 7, yards: 185 },
];

// Back 9 (Blue): par 4-4-4-3-4-3-4-5-4 = 35
// Within-9 stroke index derived from overall HCP 2,10,12,18,6,14,16,4,8
const back = [
  { holeNumber: 1, par: 4, strokeIndex: 1, yards: 412 },
  { holeNumber: 2, par: 4, strokeIndex: 5, yards: 409 },
  { holeNumber: 3, par: 4, strokeIndex: 6, yards: 341 },
  { holeNumber: 4, par: 3, strokeIndex: 9, yards: 160 },
  { holeNumber: 5, par: 4, strokeIndex: 3, yards: 409 },
  { holeNumber: 6, par: 3, strokeIndex: 7, yards: 182 },
  { holeNumber: 7, par: 4, strokeIndex: 8, yards: 294 },
  { holeNumber: 8, par: 5, strokeIndex: 2, yards: 564 },
  { holeNumber: 9, par: 4, strokeIndex: 4, yards: 430 },
];

const COURSE_NAME = "The Links at Erie Village (Blue)";
// 9-hole rating ~ half of 18-hole rating (72.7); slope same number per USGA convention.
// Front 9 par 36 -> rating ~36.4; back 9 par 35 -> rating ~36.3.
const FRONT_RATING = 36.4;
const BACK_RATING = 36.3;
const SLOPE = 132;

function upsertCourse(layout: "front" | "back", rating: number) {
  const existing = db.prepare("SELECT id FROM courses WHERE layout = ?").get(layout) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE courses SET name = ?, course_rating = ?, slope = ? WHERE id = ?")
      .run(COURSE_NAME, rating, SLOPE, existing.id);
    return existing.id;
  }
  const r = db.prepare("INSERT INTO courses (name, layout, course_rating, slope) VALUES (?, ?, ?, ?)")
    .run(COURSE_NAME, layout, rating, SLOPE);
  return r.lastInsertRowid as number;
}

function upsertHoles(courseId: number, holesData: typeof front) {
  for (const h of holesData) {
    const existing = db.prepare("SELECT id FROM holes WHERE course_id = ? AND hole_number = ?")
      .get(courseId, h.holeNumber) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE holes SET par = ?, stroke_index = ?, yards = ? WHERE id = ?")
        .run(h.par, h.strokeIndex, h.yards, existing.id);
    } else {
      db.prepare("INSERT INTO holes (course_id, hole_number, par, stroke_index, yards) VALUES (?, ?, ?, ?, ?)")
        .run(courseId, h.holeNumber, h.par, h.strokeIndex, h.yards);
    }
  }
}

const frontId = upsertCourse("front", FRONT_RATING);
upsertHoles(frontId, front);
const backId = upsertCourse("back", BACK_RATING);
upsertHoles(backId, back);

console.log(`OK — seeded "${COURSE_NAME}". Front courseId=${frontId}, Back courseId=${backId}`);
db.close();
