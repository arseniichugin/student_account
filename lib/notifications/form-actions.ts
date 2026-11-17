"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions/errors";
import { requireStaff, requireTeacher } from "@/lib/auth/guards";
import {
  STAFF_AUDIENCES,
  TEACHER_AUDIENCES,
  createFacultyAnnouncement,
  createTeacherAnnouncement,
  deleteFacultyAnnouncement,
  deleteTeacherAnnouncement,
  type Audience,
  type CreateAnnouncementInput,
  type CreateAnnouncementResult,
} from "@/lib/data/notifications";
import { isIsoDate, moscowDateTime } from "@/lib/moscow-time";
import { formatDateTime } from "@/lib/utils";
import {
  createAnnouncementSchema,
  deleteAnnouncementSchema,
  type AnnouncementFormState,
} from "@/lib/validation/notifications";

// Серверные действия формы события: деканат (/staff/notifications) и преподаватель (/teacher/notifications).
// Роль — из сессии; допустимые аудитории роли проверяются здесь и в lib/data/notifications.ts.

type Parsed = { ok: true; input: CreateAnnouncementInput } | { ok: false; state: AnnouncementFormState };

function parseForm(formData: FormData, allowed: readonly string[]): Parsed {
  const parsed = createAnnouncementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, state: { error: "Проверьте поля формы", fieldErrors } };
  }
  const v = parsed.data;
  if (!allowed.includes(v.audience)) {
    return { ok: false, state: { error: "Такая аудитория вам недоступна", fieldErrors: { audience: "Выберите другой вариант" } } };
  }

  let sendAt: Date | null = null;
  if (v.when === "later" && v.sendAt) {
    const [date, time] = v.sendAt.split("T") as [string, string];
    if (!isIsoDate(date)) return { ok: false, state: { error: "Проверьте дату отправки", fieldErrors: { sendAt: "Такой даты нет" } } };
    sendAt = moscowDateTime(date, time);
  }
  const audience: Audience =
    v.audience === "course"
      ? { type: "course", course: v.course! }
      : v.audience === "group"
        ? { type: "group", groupId: v.groupId! }
        : v.audience === "teacher"
          ? { type: "teacher", teacherId: v.teacherId! }
          : { type: v.audience };
  return { ok: true, input: { kind: v.kind, title: v.title, body: v.body, audience, sendAt } };
}

function toState(result: CreateAnnouncementResult): AnnouncementFormState {
  if (!result.ok) return { error: result.error };
  return {
    success: result.scheduled
      ? `Событие запланировано на ${formatDateTime(result.publishedAt)} (МСК). Получателей: ${result.recipients}.`
      : `Отправлено. Получателей: ${result.recipients}.`,
    savedAt: Date.now(),
  };
}

export async function createStaffAnnouncementAction(_prev: AnnouncementFormState, formData: FormData): Promise<AnnouncementFormState> {
  const ctx = await requireStaff();
  const parsed = parseForm(formData, STAFF_AUDIENCES);
  if (!parsed.ok) return parsed.state;
  const input = parsed.input;
  return runAction(
    "createStaffAnnouncement",
    async () => {
      const state = toState(await createFacultyAnnouncement(ctx, input));
      revalidatePath("/staff/notifications");
      return state;
    },
    (error) => ({ error }),
  );
}

export async function createTeacherAnnouncementAction(_prev: AnnouncementFormState, formData: FormData): Promise<AnnouncementFormState> {
  const ctx = await requireTeacher();
  const parsed = parseForm(formData, TEACHER_AUDIENCES);
  if (!parsed.ok) return parsed.state;
  const input = parsed.input;
  return runAction(
    "createTeacherAnnouncement",
    async () => {
      const state = toState(await createTeacherAnnouncement(ctx, input));
      revalidatePath("/teacher/notifications");
      return state;
    },
    (error) => ({ error }),
  );
}

const NOT_FOUND = "Событие не найдено — возможно, его уже удалили. Обновите страницу.";

export async function deleteStaffAnnouncementAction(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requireStaff();
  const parsed = deleteAnnouncementSchema.safeParse({ announcementId: formData.get("announcementId") });
  if (!parsed.success) return { error: NOT_FOUND };
  const id = parsed.data.announcementId;
  return runAction(
    "deleteStaffAnnouncement",
    async () => {
      const deleted = await deleteFacultyAnnouncement(ctx, id);
      revalidatePath("/staff/notifications");
      return deleted ? {} : { error: NOT_FOUND };
    },
    (error) => ({ error }),
  );
}

export async function deleteTeacherAnnouncementAction(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requireTeacher();
  const parsed = deleteAnnouncementSchema.safeParse({ announcementId: formData.get("announcementId") });
  if (!parsed.success) return { error: NOT_FOUND };
  const id = parsed.data.announcementId;
  return runAction(
    "deleteTeacherAnnouncement",
    async () => {
      const deleted = await deleteTeacherAnnouncement(ctx, id);
      revalidatePath("/teacher/notifications");
      return deleted ? {} : { error: NOT_FOUND };
    },
    (error) => ({ error }),
  );
}
