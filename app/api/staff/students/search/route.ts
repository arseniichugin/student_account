import { getStaffContext, getUserContext } from "@/lib/auth/guards";
import { searchFacultyStudents } from "@/lib/data/dean-grades";
import { STUDENT_SEARCH_LIMIT, studentSearchSchema, type StudentSearchResponse } from "@/lib/validation/dean-grades";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Поиск студента для деканата: GET /api/staff/students/search?q=Орлова или ?q=25СЛ0001.
 * Без сессии — 401, студент и преподаватель — 403 (без данных). Ищет только среди студентов
 * факультета сотрудника (ctx.facultyId из сессии); в ответе — ФИО, зачётка, группа, курс.
 */
export async function GET(request: Request) {
  const user = await getUserContext();
  if (!user) {
    return Response.json({ error: "Войдите, чтобы искать студентов" } satisfies StudentSearchResponse, { status: 401, headers: NO_STORE });
  }
  const ctx = await getStaffContext();
  if (!ctx) {
    return Response.json({ error: "Поиск студентов доступен только деканату" } satisfies StudentSearchResponse, {
      status: 403,
      headers: NO_STORE,
    });
  }

  const parsed = studentSearchSchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return Response.json({ error: "Слишком длинный запрос" } satisfies StudentSearchResponse, { status: 400, headers: NO_STORE });
  }

  const { exact, results, layout } = await searchFacultyStudents(ctx, parsed.data.q, STUDENT_SEARCH_LIMIT);
  return Response.json(
    {
      exact,
      results: results.map((s) => ({ recordBookNo: s.recordBookNo, fullName: s.fullName, group: s.group.name, course: s.course })),
      ...(layout ? { layout } : {}),
    } satisfies StudentSearchResponse,
    { headers: NO_STORE },
  );
}
