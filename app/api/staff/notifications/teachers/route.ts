import { getStaffContext } from "@/lib/auth/guards";
import { suggestFacultyTeachers } from "@/lib/data/notifications";
import { groupSuggestSchema } from "@/lib/validation/notifications";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Подсказки поля «Преподаватель» в форме события деканата: GET /api/staff/notifications/teachers?q=Арс.
 * Только преподаватели, которые ведут занятия у групп своего факультета, не больше 5. 401 — не сотрудник.
 */
export async function GET(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return Response.json({ error: "Войдите как сотрудник деканата" }, { status: 401, headers: NO_STORE });
  const parsed = groupSuggestSchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return Response.json({ error: "Слишком длинный запрос" }, { status: 400, headers: NO_STORE });
  return Response.json({ results: await suggestFacultyTeachers(ctx, parsed.data.q) }, { headers: NO_STORE });
}
