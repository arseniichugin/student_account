"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions/errors";
import { getStaffContext, getTeacherContext, requireTeacher } from "@/lib/auth/guards";
import { setTeacherAttendance } from "@/lib/data/journal";
import { createMark, deleteMark, type Grader } from "@/lib/data/marks";
import {
  journalAttendanceSchema,
  journalMarkSchema,
  journalRemoveMarkSchema,
  safeJournalBack,
  type JournalMessage,
} from "@/lib/validation/journal";

// Действия ввода оценок без JavaScript: журнал преподавателя (/teacher/marks), таблица и форма поиска
// деканата (/staff/marks). Каждое — обычная форма (<form action>), после сохранения — возврат на ту же
// страницу (адрес из поля back, только /teacher|staff/marks…). Ошибка — КОД в параметре msg (текст —
// в lib/validation/journal.ts), успех — ok=1. Права (свой факультет / свои группы и занятия) —
// в lib/data/marks.ts и lib/data/journal.ts; кто ставит — только по сессии.

async function requireGrader(): Promise<Grader> {
  const ctx = (await getStaffContext()) ?? (await getTeacherContext());
  if (!ctx) redirect("/login");
  return ctx;
}

function back(formData: FormData, ctx: Grader, result: { error?: JournalMessage; ok?: boolean }): never {
  const fallback = "teacherId" in ctx ? "/teacher/marks" : "/staff/marks";
  const url = new URL(safeJournalBack(formData.get("back"), fallback), "http://local");
  url.searchParams.delete("msg");
  url.searchParams.delete("ok");
  if (result.error) url.searchParams.set("msg", result.error);
  if (result.ok) url.searchParams.set("ok", "1");
  revalidatePath("/teacher/marks");
  revalidatePath("/staff/marks");
  redirect(`${url.pathname}${url.search}#editor`);
}

export async function addJournalMarkAction(formData: FormData): Promise<void> {
  const ctx = await requireGrader();
  const parsed = journalMarkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData, ctx, { error: "mark" });
  const input = parsed.data;
  const error = await runAction(
    "journalAddMark",
    async () => {
      const r = await createMark(ctx, input);
      return r.ok ? undefined : ("mark" as const);
    },
    () => "server" as const,
  );
  back(formData, ctx, error ? { error } : { ok: true });
}

export async function removeJournalMarkAction(formData: FormData): Promise<void> {
  const ctx = await requireGrader();
  const parsed = journalRemoveMarkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData, ctx, { error: "remove" });
  const id = parsed.data.markId;
  const error = await runAction(
    "journalRemoveMark",
    async () => ((await deleteMark(ctx, id)) ? undefined : ("remove" as const)),
    () => "server" as const,
  );
  back(formData, ctx, { error });
}

/** Посещаемость отмечает только преподаватель (у деканата — просмотр). */
export async function setJournalAttendanceAction(formData: FormData): Promise<void> {
  const ctx = await requireTeacher();
  const parsed = journalAttendanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData, ctx, { error: "attendance" });
  const { studentId, lessonId, status } = parsed.data;
  const error = await runAction(
    "journalAttendance",
    async () => {
      const r = await setTeacherAttendance(ctx, { studentId, lessonId, status: status === "CLEAR" ? null : status });
      return r.ok ? undefined : ("attendance" as const);
    },
    () => "server" as const,
  );
  back(formData, ctx, { error });
}
