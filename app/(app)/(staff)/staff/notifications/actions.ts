"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { createFacultyAnnouncement, deleteFacultyAnnouncement, type Audience } from "@/lib/data/notifications";
import { isIsoDate, moscowDateTime } from "@/lib/moscow-time";
import { formatDateTime } from "@/lib/utils";
import { createAnnouncementSchema, deleteAnnouncementSchema } from "@/lib/validation/notifications";

export type AnnouncementFormState =
  | { error?: string; fieldErrors?: Record<string, string>; success?: string; savedAt?: number }
  | undefined;

/** Создать событие. Все проверки доступа (свой факультет, своя группа) — в lib/data/notifications.ts. */
export async function createAnnouncementAction(_prev: AnnouncementFormState, formData: FormData): Promise<AnnouncementFormState> {
  const ctx = await requireStaff();

  const parsed = createAnnouncementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Проверьте поля формы", fieldErrors };
  }
  const v = parsed.data;

  let sendAt: Date | null = null;
  if (v.when === "later" && v.sendAt) {
    const [date, time] = v.sendAt.split("T") as [string, string];
    if (!isIsoDate(date)) return { error: "Проверьте дату отправки", fieldErrors: { sendAt: "Такой даты нет" } };
    sendAt = moscowDateTime(date, time);
  }
  const audience: Audience =
    v.audience === "course" ? { type: "course", course: v.course! } : v.audience === "group" ? { type: "group", groupId: v.groupId! } : { type: "faculty" };

  const result = await createFacultyAnnouncement(ctx, { kind: v.kind, title: v.title, body: v.body, audience, sendAt });
  if (!result.ok) return { error: result.error };

  revalidatePath("/staff/notifications");
  return {
    success: result.scheduled
      ? `Событие запланировано на ${formatDateTime(result.publishedAt)} (МСК). Получателей: ${result.recipients}.`
      : `Отправлено. Получателей: ${result.recipients}.`,
    savedAt: Date.now(),
  };
}

export async function deleteAnnouncementAction(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requireStaff();
  const parsed = deleteAnnouncementSchema.safeParse({ announcementId: formData.get("announcementId") });
  if (!parsed.success) return { error: "Событие не найдено" };
  const deleted = await deleteFacultyAnnouncement(ctx, parsed.data.announcementId);
  revalidatePath("/staff/notifications");
  return deleted ? {} : { error: "Событие не найдено — возможно, его уже удалили. Обновите страницу." };
}
