import { z } from "zod";
import { AUDIENCES, STAFF_NOTIFICATION_KINDS } from "@/lib/notifications/labels";

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 2000;
/** Сколько групп/преподавателей возвращают функции suggest… (lib/data/notifications.ts; форма теперь использует полные выпадающие списки). */
export const GROUP_SUGGEST_LIMIT = 5;

/** Пустая строка из формы → «не задано». */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

/** Поля формы «Новое событие» (кабинет деканата). Время — «YYYY-MM-DDTHH:MM» по Москве (input datetime-local). */
export const createAnnouncementSchema = z
  .object({
    kind: z.enum(STAFF_NOTIFICATION_KINDS, { error: "Выберите вид события" }),
    title: z
      .string()
      .trim()
      .min(3, "Название — хотя бы 3 символа")
      .max(ANNOUNCEMENT_TITLE_MAX, `Название — не больше ${ANNOUNCEMENT_TITLE_MAX} символов`),
    body: z
      .string()
      .trim()
      .min(1, "Напишите текст сообщения")
      .max(ANNOUNCEMENT_BODY_MAX, `Текст — не больше ${ANNOUNCEMENT_BODY_MAX} символов`),
    audience: z.enum(AUDIENCES, { error: "Выберите, кому отправить" }),
    course: optional(z.coerce.number().int().min(1).max(10)),
    groupId: optional(z.string().trim().max(64)),
    teacherId: optional(z.string().trim().max(64)),
    when: z.enum(["now", "later"]),
    sendAt: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Укажите дату и время отправки")),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "course" && v.course == null) ctx.addIssue({ code: "custom", path: ["course"], message: "Выберите курс" });
    if (v.audience === "group" && !v.groupId) {
      ctx.addIssue({ code: "custom", path: ["groupId"], message: "Выберите группу из списка" });
    }
    if (v.audience === "teacher" && !v.teacherId) {
      ctx.addIssue({ code: "custom", path: ["teacherId"], message: "Выберите преподавателя из списка" });
    }
    if (v.when === "later" && !v.sendAt) {
      ctx.addIssue({ code: "custom", path: ["sendAt"], message: "Укажите дату и время отправки" });
    }
  });

export type CreateAnnouncementForm = z.infer<typeof createAnnouncementSchema>;

/** Запрос подсказок групп/преподавателей (используется функциями suggest… в тестах и для будущих API). */
export const groupSuggestSchema = z.object({ q: z.string().trim().max(64).default("") });

export const deleteAnnouncementSchema = z.object({ announcementId: z.string().trim().min(1).max(64) });

/** Ответ серверного действия формы события. */
export type AnnouncementFormState =
  | { error?: string; fieldErrors?: Record<string, string>; success?: string; savedAt?: number }
  | undefined;
