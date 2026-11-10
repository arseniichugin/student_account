/**
 * Переносы занятий: разбор причины «Перенесено с 03.11 (1 пара)» у перенесённого занятия.
 * Чистые функции без базы — покрыты тестами (tests/schedule-moves.test.ts).
 *
 * В базе есть только новое занятие (статус MOVED) с причиной в note; исходной даты отдельным полем нет.
 * Поэтому разбор необязательный: если в заменяемых данных вуза причина записана иначе,
 * функция вернёт null — на исходной дате просто не будет заглушки «Перенесено на …».
 */
import { addDaysIso, daysBetweenIso, isIsoDate } from "@/lib/moscow-time";

/** Перенос дальше чем на столько дней считаем ошибкой разбора (генератор переносит на −4…+7 дней). */
export const MAX_MOVE_DAYS = 60;

/** Шаблон генератора: «Перенесено с ДД.ММ (N пара)»; год и диапазон пар — необязательно. */
const MOVED_FROM_RE = /^\s*Перенесено с (\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*\((\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?(?:-я)? пар[аы]?\)/u;

export type MovedFrom = { date: string; pairStart: number; pairEnd: number };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Откуда перенесено занятие, которое теперь идёт в `movedTo` («YYYY-MM-DD»).
 * Год в причине обычно не пишут — берём ближайшую к `movedTo` дату с такими днём и месяцем.
 * Не подходит под шаблон, несуществующая дата или перенос дальше MAX_MOVE_DAYS — null.
 */
export function parseMovedFrom(note: string | null | undefined, movedTo: string): MovedFrom | null {
  if (!note || !isIsoDate(movedTo)) return null;
  const m = MOVED_FROM_RE.exec(note);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const pairStart = Number(m[4]);
  const pairEnd = m[5] ? Number(m[5]) : pairStart;
  if (pairStart < 1 || pairEnd < pairStart) return null;

  const year = Number(movedTo.slice(0, 4));
  const years = m[3] ? [Number(m[3])] : [year - 1, year, year + 1];
  let best: string | null = null;
  for (const y of years) {
    const candidate = `${y}-${pad(month)}-${pad(day)}`;
    if (!isIsoDate(candidate)) continue;
    if (!best || Math.abs(daysBetweenIso(candidate, movedTo)) < Math.abs(daysBetweenIso(best, movedTo))) best = candidate;
  }
  if (!best || Math.abs(daysBetweenIso(best, movedTo)) > MAX_MOVE_DAYS) return null;
  return { date: best, pairStart, pairEnd };
}

/** «06.11» — коротко, как в причинах переноса. */
export function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

/** Период, в котором искать перенесённые занятия, чтобы найти всё, что ушло с дат from…to. */
export function movedSearchRange(from: string, to: string): { from: string; to: string } {
  return { from: addDaysIso(from, -MAX_MOVE_DAYS), to: addDaysIso(to, MAX_MOVE_DAYS) };
}
