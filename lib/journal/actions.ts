"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/lib/actions/errors";
import { requireTeacher } from "@/lib/auth/guards";
import { setTeacherAttendance } from "@/lib/data/journal";
import { createMark, deleteMark } from "@/lib/data/marks";
import {
  journalAttendanceSchema,
  journalMarkSchema,
  journalRemoveMarkSchema,
  safeJournalBack,
  type JournalMessage,
} from "@/lib/validation/journal";

// Действия журнала преподавателя. Каждое — обычная форма (<form action>): работает и без JavaScript.
// После сохранения — возврат на ту же страницу журнала (с открытой клеткой), ошибка — КОД в параметре msg
// (текст — в lib/validation/journal.ts; подробности ошибки сервера — в логе через runAction).
// Права (свои группы, свои занятия) — в lib/data/marks.ts и lib/data/journal.ts.

function back(formData: FormData, error?: JournalMessage): never {
  const url = new URL(safeJournalBack(formData.get("back")), "http://local");
  if (error) url.searchParams.set("msg", error);
  else url.searchParams.delete("msg");
  revalidatePath("/teacher/marks");
  redirect(`${url.pathname}${url.search}#editor`);
}

export async function addJournalMarkAction(formData: FormData): Promise<void> {
  const ctx = await requireTeacher();
  const parsed = journalMarkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData, "mark");
  const input = parsed.data;
  const error = await runAction(
    "journalAddMark",
    async () => {
      const r = await createMark(ctx, input);
      return r.ok ? undefined : ("mark" as const);
    },
    () => "server" as const,
  );
  back(formData, error);
}

export async function removeJournalMarkAction(formData: FormData): Promise<void> {
  const ctx = await requireTeacher();
  const parsed = journalRemoveMarkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData, "remove");
  const id = parsed.data.markId;
  const error = await runAction(
    "journalRemoveMark",
    async () => ((await deleteMark(ctx, id)) ? undefined : ("remove" as const)),
    () => "server" as const,
  );
  back(formData, error);
}

export async function setJournalAttendanceAction(formData: FormData): Promise<void> {
  const ctx = await requireTeacher();
  const parsed = journalAttendanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(formData, "attendance");
  const { studentId, lessonId, status } = parsed.data;
  const error = await runAction(
    "journalAttendance",
    async () => {
      const r = await setTeacherAttendance(ctx, { studentId, lessonId, status: status === "CLEAR" ? null : status });
      return r.ok ? undefined : ("attendance" as const);
    },
    () => "server" as const,
  );
  back(formData, error);
}
