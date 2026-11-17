import { getTeacherContext } from "@/lib/auth/guards";
import { suggestTeacherGroups } from "@/lib/data/notifications";
import { groupSuggestSchema } from "@/lib/validation/notifications";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Подсказки поля «Группа» в форме события преподавателя: GET /api/teacher/groups?q=1-ГР.
 * Только группы, у которых он ведёт занятия, не больше 5. 401 — не преподаватель.
 */
export async function GET(request: Request) {
  const ctx = await getTeacherContext();
  if (!ctx) return Response.json({ error: "Войдите как преподаватель" }, { status: 401, headers: NO_STORE });
  const parsed = groupSuggestSchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return Response.json({ error: "Слишком длинный запрос" }, { status: 400, headers: NO_STORE });
  return Response.json({ results: await suggestTeacherGroups(ctx, parsed.data.q) }, { headers: NO_STORE });
}
