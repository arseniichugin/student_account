import { z } from "zod";

/** Длина поискового запроса по расписанию: дольше — это уже не название группы и не фамилия. */
export const SCHEDULE_SEARCH_MAX_LENGTH = 64;
/** Сколько подсказок отдаёт поиск. */
export const SCHEDULE_SEARCH_LIMIT = 20;

/** Параметры GET /api/schedule/search?q=…&faculty=… */
export const scheduleSearchSchema = z.object({
  q: z.string().trim().max(SCHEDULE_SEARCH_MAX_LENGTH),
  faculty: z.string().trim().max(64).optional(),
});

/** Подсказка поиска: только группы и преподаватели. Поля перечисляет обработчик явно — лишнее в ответ не попадёт. */
export type ScheduleSearchItem =
  | { type: "group"; id: string; name: string; kind: "academic" | "language" | "other"; course: number | null; faculty: string | null }
  | { type: "teacher"; id: string; shortName: string; fullName: string; rank: string | null };

export type ScheduleSearchResponse = { results: ScheduleSearchItem[] } | { error: string };
