// Thin client for https://api.golfcourseapi.com (v1).
// Free tier; auth via header `Authorization: Key <KEY>`.
//
// Only the endpoints we need are wrapped:
//   GET  /v1/search?search_query=...
//   GET  /v1/courses/{id}
//
// All response shapes are typed loosely (fields beyond what we use can be
// added without code changes thanks to importGolfCourse only reading known
// fields).

const BASE_URL = "https://api.golfcourseapi.com/v1";

function authHeader(): Record<string, string> {
  const key = process.env.GOLF_COURSE_API_KEY;
  if (!key) throw new Error("GOLF_COURSE_API_KEY is not set on the server");
  return { Authorization: `Key ${key}` };
}

export type GolfCourseApiSearchResult = {
  courses: Array<{
    id: number;
    club_name: string;
    course_name: string;
    location?: {
      address?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
  }>;
};

export type GolfCourseApiHole = {
  par?: number;
  yardage?: number;
  handicap?: number;
};

export type GolfCourseApiTee = {
  tee_name?: string;
  course_rating?: number;
  slope_rating?: number;
  bogey_rating?: number;
  total_yards?: number;
  total_meters?: number;
  number_of_holes?: number;
  par_total?: number;
  front_course_rating?: number;
  front_slope_rating?: number;
  front_bogey_rating?: number;
  back_course_rating?: number;
  back_slope_rating?: number;
  back_bogey_rating?: number;
  holes?: GolfCourseApiHole[];
};

export type GolfCourseApiCourse = {
  id: number;
  club_name: string;
  course_name: string;
  location?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  tees?: {
    male?: GolfCourseApiTee[];
    female?: GolfCourseApiTee[];
  };
};

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeader() });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GolfCourseAPI ${res.status}: ${txt || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function searchCourses(query: string): Promise<GolfCourseApiSearchResult> {
  const q = encodeURIComponent(query);
  return call<GolfCourseApiSearchResult>(`/search?search_query=${q}`);
}

export function getCourse(id: number): Promise<GolfCourseApiCourse> {
  return call<GolfCourseApiCourse>(`/courses/${id}`);
}
