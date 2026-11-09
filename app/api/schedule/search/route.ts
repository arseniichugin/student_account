import { getUserContext } from "@/lib/auth/guards";
import { searchScheduleTargets, type ScheduleTarget } from "@/lib/data/schedule";
import {
  SCHEDULE_SEARCH_LIMIT,
  scheduleSearchSchema,
  type ScheduleSearchItem,
  type ScheduleSearchResponse,
} from "@/lib/validation/schedule";

const NO_STORE = { "Cache-Control": "private, no-store" };

function toItem(t: ScheduleTarget): ScheduleSearchItem {
  return t.type === "group"
    ? { type: "group", id: t.id, name: t.name, kind: t.kind, course: t.course, faculty: t.faculty?.name ?? null }
    : { type: "teacher", id: t.id, shortName: t.shortName, fullName: t.fullName, rank: t.rank };
}

/**
 * Подсказки для поиска на вкладке «Расписание»: GET /api/schedule/search?q=2-СЛ&faculty=<id>.
 * Только для вошедших (401 без сессии — без редиректа: это API, а не страница). Студентов не возвращает.
 */
export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return Response.json({ error: "Войдите, чтобы искать по расписанию" } satisfies ScheduleSearchResponse, {
      status: 401,
      headers: NO_STORE,
    });
  }

  const params = new URL(request.url).searchParams;
  const parsed = scheduleSearchSchema.safeParse({
    q: params.get("q") ?? "",
    faculty: params.get("faculty") || undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "Слишком длинный запрос" } satisfies ScheduleSearchResponse, {
      status: 400,
      headers: NO_STORE,
    });
  }

  const { q, faculty } = parsed.data;
  const results = await searchScheduleTargets(ctx, q, { facultyId: faculty, limit: SCHEDULE_SEARCH_LIMIT });
  return Response.json({ results: results.map(toItem) } satisfies ScheduleSearchResponse, { headers: NO_STORE });
}
