/**
 * Чистые функции для экранов расписания: разбор параметров адреса, подписи времени,
 * группировка по дням. Без обращения к базе — работают и на сервере, и в браузере; покрыты тестами.
 * Даты — строки «YYYY-MM-DD», время — «HH:MM», всё по Москве (см. lib/moscow-time.ts).
 */
import { addDaysIso, daysBetweenIso, isIsoDate, isoDateToDb, moscowDateTime } from "@/lib/moscow-time";

type SearchParam = string | string[] | undefined;

/** Первое значение параметра адреса (`?a=1&a=2` → «1»). */
export function firstParam(value: SearchParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `?date=YYYY-MM-DD` → дата; пустая, невалидная («мусор», 2026-02-30) или
 * слишком далёкая (вне 2000–2099) → `fallback` (обычно «сегодня»). Никогда не бросает.
 */
export function parseDateParam(value: SearchParam, fallback: string): string {
  const v = firstParam(value)?.trim();
  if (!v || !isIsoDate(v)) return fallback;
  const year = Number(v.slice(0, 4));
  return year >= 2000 && year <= 2099 ? v : fallback;
}

export type ScheduleView = "week" | "day";

/** `?view=day` → «день», всё остальное → «неделя» (вид по умолчанию). */
export function parseViewParam(value: SearchParam): ScheduleView {
  return firstParam(value) === "day" ? "day" : "week";
}

/** id группы или преподавателя из адреса: пустой или длиннее 64 символов → null. */
export function parseIdParam(value: SearchParam): string | null {
  const v = firstParam(value)?.trim();
  return v && v.length <= 64 ? v : null;
}

/** Все даты периода по порядку, включительно. */
export function datesInRange(from: string, to: string): string[] {
  const n = daysBetweenIso(from, to);
  return Array.from({ length: Math.max(n + 1, 0) }, (_, i) => addDaysIso(from, i));
}

/** Раскладывает занятия по дням периода; дни без занятий тоже есть (с пустым списком). */
export function groupLessonsByDate<T extends { date: string }>(
  lessons: T[],
  from: string,
  to: string,
): { date: string; lessons: T[] }[] {
  const byDate = new Map<string, T[]>(datesInRange(from, to).map((d) => [d, []]));
  for (const l of lessons) byDate.get(l.date)?.push(l);
  return [...byDate].map(([date, list]) => ({ date, lessons: list }));
}

/** Первый день после `after` с хотя бы одним неотменённым занятием (для «Ближайшие пары — …»). */
export function firstDayWithLessons<T extends { date: string; status: string }>(lessons: T[], after: string): string | null {
  const dates = lessons.filter((l) => l.date > after && l.status !== "cancelled").map((l) => l.date);
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

/**
 * Когда начнётся занятие: «через 25 мин», «через 1 ч 20 мин» (до 3 часов), дальше — «в 12:55».
 * minutes — сколько минут осталось до начала (округление вверх).
 */
export function startsInLabel(minutes: number, start: string): string {
  if (minutes <= 1) return "через минуту";
  if (minutes < 60) return `через ${minutes} мин`;
  if (minutes < 180) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `через ${h} ч ${m} мин` : `через ${h} ч`;
  }
  return `в ${start}`;
}

/** «ещё 25 мин» — сколько осталось до конца идущего занятия. */
export function endsInLabel(minutes: number): string {
  if (minutes <= 1) return "заканчивается";
  if (minutes < 60) return `ещё ${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `ещё ${h} ч ${m} мин` : `ещё ${h} ч`;
}

export type DayTiming = {
  /** Идёт сейчас */
  currentId: string | null;
  currentLabel: string | null;
  /** Следующее (первое ещё не начавшееся) */
  nextId: string | null;
  nextLabel: string | null;
};

const MINUTE = 60_000;

/**
 * Какое занятие идёт сейчас и какое следующее — по московскому времени.
 * Отменённые не считаются. Вызывать для списка занятий одного дня — «сегодня»;
 * занятия дальше чем через сутки «следующими» не отмечаются.
 */
export function dayTiming<T extends { id: string; date: string; start: string; end: string; status: string }>(
  lessons: T[],
  now: Date,
): DayTiming {
  const result: DayTiming = { currentId: null, currentLabel: null, nextId: null, nextLabel: null };
  const t = now.getTime();
  for (const l of lessons) {
    if (l.status === "cancelled") continue;
    const start = moscowDateTime(l.date, l.start).getTime();
    const end = moscowDateTime(l.date, l.end).getTime();
    if (start <= t && t < end && !result.currentId) {
      result.currentId = l.id;
      result.currentLabel = endsInLabel(Math.ceil((end - t) / MINUTE));
    } else if (start > t && !result.nextId) {
      const minutes = Math.ceil((start - t) / MINUTE);
      if (minutes > 24 * 60) continue;
      result.nextId = l.id;
      result.nextLabel = startsInLabel(minutes, l.start);
    }
  }
  return result;
}

// ─── Подписи дат ───────────────────────────────────────────────────

// Даты «YYYY-MM-DD» превращаем в полночь UTC и форматируем в UTC — так день не «съезжает»
// из-за часового пояса сервера или браузера.
const longFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortWeekdayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const dayMonthFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthYearFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** «вторник, 10 ноября» */
export function formatDayLong(date: string): string {
  return longFmt.format(isoDateToDb(date));
}

/** «Вт, 10 ноября» */
export function formatDayShort(date: string): string {
  const wd = shortWeekdayFmt.format(isoDateToDb(date));
  return `${wd[0]!.toUpperCase()}${wd.slice(1)}, ${dayMonthFmt.format(isoDateToDb(date))}`;
}

/** «9–15 ноября 2026», «30 ноября – 6 декабря 2026», «28 декабря 2026 – 3 января 2027» */
export function formatWeekRange(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm] = to.split("-");
  const end = dayMonthYearFmt.format(isoDateToDb(to));
  if (fy !== ty) return `${dayMonthYearFmt.format(isoDateToDb(from))} – ${end}`;
  if (fm !== tm) return `${dayMonthFmt.format(isoDateToDb(from))} – ${end}`;
  return `${Number(fd)}–${end}`;
}

/** «1 занятие», «3 занятия», «5 занятий», «21 занятие», «11 занятий». */
export function lessonsCountLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} занятие`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} занятия`;
  return `${n} занятий`;
}

/** «1-я пара», «1–2 пары»; null — номер не указан. */
export function pairLabel(pairStart: number | null, pairEnd: number | null): string | null {
  if (pairStart == null) return null;
  return pairEnd != null && pairEnd !== pairStart ? `${pairStart}–${pairEnd} пары` : `${pairStart}-я пара`;
}
