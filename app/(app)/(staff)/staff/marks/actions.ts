"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { createFacultyMark, deleteFacultyMark } from "@/lib/data/marks";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { createMarkSchema, deleteMarkSchema } from "@/lib/validation/marks";

export type MarkFormState = { error?: string; success?: string; savedAt?: number } | undefined;

/** Выставить оценку. Все проверки (свой факультет, занятие студента, дата не в будущем) — в lib/data/marks.ts. */
export async function createMarkAction(_prev: MarkFormState, formData: FormData): Promise<MarkFormState> {
  const ctx = await requireStaff();

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

  const result = await createFacultyMark(ctx, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/staff/marks");
  return {
    success: `Оценка «${result.value}» выставлена: ${result.student}, ${result.discipline}, ${formatDayMonthLong(result.date)} (${result.start})`,
    savedAt: Date.now(),
  };
}

export async function deleteMarkAction(formData: FormData): Promise<void> {
  const ctx = await requireStaff();
  const parsed = deleteMarkSchema.safeParse({ markId: formData.get("markId") });
  if (!parsed.success) return;
  await deleteFacultyMark(ctx, parsed.data.markId);
  revalidatePath("/staff/marks");
}
