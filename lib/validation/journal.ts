import { z } from "zod";

const id = z.string().trim().min(1).max(64);

/**
 * Куда вернуться после сохранения: только страницы ввода оценок (журнал преподавателя, таблица и форма деканата).
 * Защита от открытого редиректа. Иначе — fallback (страница той роли, что вызвала действие).
 */
export function safeJournalBack(value: unknown, fallback = "/teacher/marks"): string {
  const s = typeof value === "string" ? value : "";
  return /^\/(teacher|staff)\/marks(\?[\w\-=&%.:]*)?$/.test(s) ? s : fallback;
}

export const journalMarkSchema = z.object({
  studentId: id,
  lessonId: id,
  value: z.coerce.number().int().min(1).max(5),
});

export const journalRemoveMarkSchema = z.object({ markId: id });

export const journalAttendanceSchema = z.object({
  studentId: id,
  lessonId: id,
  /** «CLEAR» — снять отметку */
  status: z.enum(["PRESENT", "LATE", "ABSENT", "CLEAR"]),
});

/**
 * Сообщения журнала. В адрес (?msg=) попадает только код — текст берётся отсюда,
 * поэтому чужая ссылка не может показать на странице произвольный текст.
 */
export const JOURNAL_MESSAGES = {
  mark: "Не удалось поставить оценку: занятие должно уже начаться, студент — учиться в вашей группе; лимит — 10 оценок на занятие и 300 в час.",
  remove: "Удалить можно только свою оценку (деканат — выставленную деканатом, преподаватель — выставленную им).",
  attendance: "Не удалось отметить посещаемость: занятие должно уже начаться, студент — учиться в вашей группе; лимит — 600 отметок в час.",
  server: "Не удалось сохранить из-за ошибки на сервере. Попробуйте ещё раз; если повторяется — сообщите администратору.",
} as const;
export type JournalMessage = keyof typeof JOURNAL_MESSAGES;

export function journalMessage(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(JOURNAL_MESSAGES, code) ? JOURNAL_MESSAGES[code as JournalMessage] : null;
}
