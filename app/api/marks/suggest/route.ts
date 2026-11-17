import { getStaffContext, getTeacherContext } from "@/lib/auth/guards";
import { suggestGradableStudents, suggestGradableDisciplines, suggestGradableLessons } from "@/lib/data/marks";
import { markSuggestSchema, type MarkSuggestItem, type MarkSuggestResponse } from "@/lib/validation/marks";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Подсказки формы ввода оценок (деканат и преподаватель), не больше 5 вариантов:
 *   ?field=student&q=Иван                         — студенты своего факультета / своих групп преподавателя
 *   ?field=discipline&student=<id>&q=зель         — предметы, по которым у студента были занятия
 *   ?field=lesson&student=<id>&discipline=<id>&q=12.11 — прошедшие занятия (дата и время)
 * Только для деканата и преподавателей: 401 без сессии и для студента. Чужой студент → пустой список.
 */
export async function GET(request: Request) {
  // Ставят оценки деканат (свой факультет) и преподаватель (свои группы и занятия)
  const ctx = (await getStaffContext()) ?? (await getTeacherContext());
  if (!ctx) {
    return Response.json({ error: "Войдите как сотрудник деканата или преподаватель" } satisfies MarkSuggestResponse, {
      status: 401,
      headers: NO_STORE,
    });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = markSuggestSchema.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: "Неверный запрос" } satisfies MarkSuggestResponse, { status: 400, headers: NO_STORE });
  }

  const query = parsed.data;
  let results: MarkSuggestItem[];
  if (query.field === "student") results = await suggestGradableStudents(ctx, query.q);
  else if (query.field === "discipline") results = await suggestGradableDisciplines(ctx, query.student, query.q);
  else results = await suggestGradableLessons(ctx, query.student, query.discipline, query.q);

  return Response.json({ results } satisfies MarkSuggestResponse, { headers: NO_STORE });
}
