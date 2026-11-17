"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStaffContext, getTeacherContext } from "@/lib/auth/guards";
import { createMark, deleteMark, type Grader } from "@/lib/data/marks";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { createMarkSchema, deleteMarkSchema, type MarkFormState } from "@/lib/validation/marks";

// Серверные действия формы оценок — общие для деканата (/staff/marks) и преподавателя (/teacher/marks).
// Кто ставит, определяется только по сессии; права (свой факультет / свои занятия) — в lib/data/marks.ts.

async function requireGrader(): Promise<Grader> {
  const ctx = (await getStaffContext()) ?? (await getTeacherContext());
  if (!ctx) redirect("/login");
  return ctx;
}

function revalidateMarkPages() {
  revalidatePath("/staff/marks");
  revalidatePath("/teacher/marks");
}

export async function createMarkAction(_prev: MarkFormState, formData: FormData): Promise<MarkFormState> {
  const ctx = await requireGrader();

  const parsed = createMarkSchema.safeParse({
    studentId: formData.get("studentId"),
    lessonId: formData.get("lessonId"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((i) => i.path[0]));
    if (fields.has("studentId")) return { error: "Выберите студента из списка подсказок" };
    if (fields.has("lessonId")) return { error: "Выберите предмет и дату занятия из списка подсказок" };
    return { error: "Выберите оценку от 1 до 5" };
  }

  const result = await createMark(ctx, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidateMarkPages();
  return {
    success: `Оценка «${result.value}» выставлена: ${result.student}, ${result.discipline}, ${formatDayMonthLong(result.date)} (${result.start})`,
    savedAt: Date.now(),
  };
}

export async function deleteMarkAction(formData: FormData): Promise<void> {
  const ctx = await requireGrader();
  const parsed = deleteMarkSchema.safeParse({ markId: formData.get("markId") });
  if (!parsed.success) return;
  await deleteMark(ctx, parsed.data.markId);
  revalidateMarkPages();
}
