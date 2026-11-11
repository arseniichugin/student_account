import { z } from "zod";

/** Длина запроса поиска студента: дольше — это уже не ФИО и не номер зачётки. */
export const STUDENT_SEARCH_MAX_LENGTH = 64;
/** Сколько подсказок отдаёт поиск студента. */
export const STUDENT_SEARCH_LIMIT = 10;

/** Параметры GET /api/staff/students/search?q=… */
export const studentSearchSchema = z.object({
  q: z.string().trim().max(STUDENT_SEARCH_MAX_LENGTH),
});

/** Подсказка поиска студента. Поля перечисляет обработчик явно — лишнее (id, логин, почта) в ответ не попадёт. */
export type StudentSearchItem = { recordBookNo: string; fullName: string; group: string; course: number };

/** layout — запрос нашёлся только в русской раскладке («jhkjdf» → «орлова»): экран подскажет про раскладку. */
export type StudentSearchResponse =
  | { exact: string | null; results: StudentSearchItem[]; layout?: string }
  | { error: string };

/** Короче — не ищем: подсказка «Введите хотя бы 2 символа» (и в поле, и на странице после Enter). */
export const STUDENT_SEARCH_MIN_LENGTH = 2;

/** Адрес страницы студента для деканата: номер зачётки — в адресе, кириллица кодируется. */
export const deanStudentHref = (recordBookNo: string, semester?: number | null) =>
  `/staff/grades/student/${encodeURIComponent(recordBookNo)}${semester ? `?semester=${semester}` : ""}`;

/** Адрес группы для деканата. */
export const deanGroupHref = (groupId: string) => `/staff/grades/group/${encodeURIComponent(groupId)}`;

/** Адрес обзора курса: первый курс — без параметра. */
export const deanCourseHref = (course: number, first: number = 1) => (course === first ? "/staff/grades" : `/staff/grades?course=${course}`);

/**
 * Номер зачётки из сегмента адреса. Next.js отдаёт params как в адресе; кириллица может прийти
 * закодированной (%D0%A1…) — раскодируем один раз, битая кодировка → пустая строка («не найдено»).
 */
export function recordBookFromParam(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}
