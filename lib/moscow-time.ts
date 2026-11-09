/**
 * Даты и время вуза. Всё расписание — по Москве. С 2014 года в Москве нет перехода
 * на летнее время, поэтому смещение постоянное: UTC+3.
 *
 * Даты передаются строками «YYYY-MM-DD», время — «HH:MM»: такие значения
 * сериализуются без потерь и не зависят от часового пояса сервера.
 */

export const UNIVERSITY_TIME_ZONE = "Europe/Moscow";
const MSK_OFFSET = "+03:00";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: UNIVERSITY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** «Сегодня» по Москве: «2026-11-09». */
export function moscowToday(now: Date = new Date()): string {
  return dateFmt.format(now);
}

/** Проверяет строку «YYYY-MM-DD» и то, что такая дата существует в календаре. */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** «YYYY-MM-DD» → Date (полночь UTC) — так Prisma хранит поля `@db.Date`. */
export function isoDateToDb(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Поле `@db.Date` из базы → «YYYY-MM-DD». */
export function dbDateToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Дата и время по Москве → момент времени (UTC). */
export function moscowDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${MSK_OFFSET}`);
}

/** Сдвиг даты «YYYY-MM-DD» на n дней. */
export function addDaysIso(value: string, days: number): string {
  const d = isoDateToDb(value);
  d.setUTCDate(d.getUTCDate() + days);
  return dbDateToIso(d);
}

/** Количество дней между датами (to − from). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((isoDateToDb(to).getTime() - isoDateToDb(from).getTime()) / 86_400_000);
}
