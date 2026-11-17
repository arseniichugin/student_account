import { getStaffContext } from "@/lib/auth/guards";
import { suggestFacultyGroups } from "@/lib/data/notifications";
import { groupSuggestSchema } from "@/lib/validation/notifications";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Подсказки поля «Группа» в форме события: GET /api/staff/notifications/groups?q=1-ГР.
 * Только группы своего факультета, не больше 5. Только для сотрудников: 401 без сессии и для студента.
 */
export async function GET(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return Response.json({ error: "Войдите как сотрудник деканата" }, { status: 401, headers: NO_STORE });

  const parsed = groupSuggestSchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return Response.json({ error: "Слишком длинный запрос" }, { status: 400, headers: NO_STORE });

  const results = await suggestFacultyGroups(ctx, parsed.data.q);
  return Response.json({ results }, { headers: NO_STORE });
}
