import { z } from "zod";

/** Сколько подсказок показывает каждое поле формы ввода оценок. */
export const MARK_SUGGEST_LIMIT = 5;
/** Защита от ошибочных повторных нажатий: больше оценок на одном занятии у одного студента не бывает. */
export const MAX_MARKS_PER_LESSON = 10;

const id = z.string().trim().min(1).max(64);
const q = z.string().trim().max(64).default("");

/** GET /api/staff/marks/suggest?field=… — подсказки для полей «Студент», «Предмет», «Дата». */
export const markSuggestSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("student"), q }),
  z.object({ field: z.literal("discipline"), student: id, q }),
  z.object({ field: z.literal("lesson"), student: id, discipline: id, q }),
]);

export type MarkSuggestQuery = z.infer<typeof markSuggestSchema>;

/** Подсказка: id + подпись + пояснение. Поля перечисляет обработчик явно — лишнее в ответ не попадёт. */
export type MarkSuggestItem = { id: string; label: string; meta: string };
export type MarkSuggestResponse = { results: MarkSuggestItem[] } | { error: string };

export const createMarkSchema = z.object({
  studentId: id,
  lessonId: id,
  value: z.coerce.number().int().min(1, "Оценка — от 1 до 5").max(5, "Оценка — от 1 до 5"),
});

export type CreateMarkInput = z.infer<typeof createMarkSchema>;

export const deleteMarkSchema = z.object({ markId: id });

/** Ответ серверного действия формы оценок. */
export type MarkFormState = { error?: string; success?: string; savedAt?: number } | undefined;
