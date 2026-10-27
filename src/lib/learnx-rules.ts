// Pure helpers for the learnX education platform integration (no I/O, unit-tested).

export const LEARNX_CATALOG_PATH = "/integrations/javobchi/catalog";

/** Accepts "https://api.example.uz/api/" and returns "https://api.example.uz/api"; null for non-https URLs. */
export function normalizeLearnxBaseUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const path = url.pathname.replace(/\/+$/, "").replace(new RegExp(`${LEARNX_CATALOG_PATH}$`), "");
  return `https://${url.host}${path}`;
}

export type LearnxSchedule = { weekDay: string; startTime: string; endTime: string };
export type LearnxGroup = {
  name: string;
  status: string;
  startDate: string | null;
  maxStudent: number | null;
  enrolled: number | null;
  room: string | null;
  teachers: string[];
  schedules: LearnxSchedule[];
};
export type LearnxCourse = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationMonth: number | null;
  durationHours: number | null;
  groups: LearnxGroup[];
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Parses the learnX catalog response (with or without the `{ success, data }` wrapper). */
export function parseLearnxCatalog(body: unknown): LearnxCourse[] | null {
  let data: unknown = body;
  if (data && typeof data === "object" && "data" in data) data = (data as { data: unknown }).data;
  if (data && typeof data === "object" && !Array.isArray(data) && "courses" in data) {
    data = (data as { courses: unknown }).courses;
  }
  if (!Array.isArray(data)) return null;
  const courses: LearnxCourse[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const name = str(c["name"]);
    const price = num(c["price"]);
    if (!name || price === null) continue;
    const groups = Array.isArray(c["groups"]) ? (c["groups"] as Record<string, unknown>[]) : [];
    courses.push({
      id: num(c["id"]) ?? courses.length + 1,
      name,
      description: str(c["description"]),
      price,
      durationMonth: num(c["durationMonth"]),
      durationHours: num(c["durationHours"]),
      groups: groups
        .filter((g) => g && typeof g === "object")
        .map((g) => ({
          name: str(g["name"]) ?? "",
          status: str(g["status"]) ?? "PLANNED",
          startDate: str(g["startDate"]),
          maxStudent: num(g["maxStudent"]),
          enrolled: num(g["enrolled"]),
          room: str(g["room"]),
          teachers: Array.isArray(g["teachers"]) ? (g["teachers"] as unknown[]).map(str).filter((t): t is string => !!t) : [],
          schedules: (Array.isArray(g["schedules"]) ? (g["schedules"] as Record<string, unknown>[]) : [])
            .map((s) => ({
              weekDay: str(s?.["weekDay"]) ?? "",
              startTime: str(s?.["startTime"]) ?? "",
              endTime: str(s?.["endTime"]) ?? "",
            }))
            .filter((s) => s.weekDay && s.startTime),
        })),
    });
  }
  return courses;
}

const WEEKDAYS_UZ: Record<string, string> = {
  MONDAY: "dushanba",
  TUESDAY: "seshanba",
  WEDNESDAY: "chorshanba",
  THURSDAY: "payshanba",
  FRIDAY: "juma",
  SATURDAY: "shanba",
  SUNDAY: "yakshanba",
};
const WEEK_ORDER = Object.keys(WEEKDAYS_UZ);

export function formatPriceUzs(price: number): string {
  return `${Math.round(price).toLocaleString("en-US").replace(/,/g, " ")} so'm`;
}

/** Groups a prospective student can still join: planned or running, with free seats when known. */
export function openGroups(course: LearnxCourse): LearnxGroup[] {
  return course.groups.filter(
    (g) =>
      (g.status === "PLANNED" || g.status === "ACTIVE") &&
      (g.maxStudent === null || g.enrolled === null || g.enrolled < g.maxStudent),
  );
}

/** Agent-ready view of a course: exact price text, duration and human-readable schedule (Uzbek). */
export function courseForAgent(course: LearnxCourse) {
  return {
    name: course.name,
    description: course.description,
    price: formatPriceUzs(course.price),
    duration: [
      course.durationMonth ? `${course.durationMonth} oy` : null,
      course.durationHours ? `${course.durationHours} soat` : null,
    ]
      .filter(Boolean)
      .join(", ") || null,
    open_groups: openGroups(course).map((g) => ({
      group: g.name,
      status: g.status === "ACTIVE" ? "davom etmoqda" : "yangi guruh",
      start_date: g.startDate ? g.startDate.slice(0, 10) : null,
      free_seats: g.maxStudent !== null && g.enrolled !== null ? g.maxStudent - g.enrolled : null,
      room: g.room,
      teachers: g.teachers,
      schedule: [...g.schedules]
        .sort((a, b) => WEEK_ORDER.indexOf(a.weekDay) - WEEK_ORDER.indexOf(b.weekDay))
        .map((s) => `${WEEKDAYS_UZ[s.weekDay] ?? s.weekDay} ${s.startTime}${s.endTime ? `–${s.endTime}` : ""}`),
    })),
  };
}
