/**
 * Чистые функции успеваемости: семестры по датам, средние, разбор оценок.
 * Без server-only — их используют и слой данных, и seed, и тесты.
 *
 * Учебный год начинается 1 сентября. Осенний семестр — сентябрь…январь (с зимней сессией),
 * весенний — февраль…август (с летней сессией). Даты — строки «YYYY-MM-DD» по Москве.
 */
import { plural } from "@/lib/utils";

/** Шкала оценок на занятиях. */
export const MARK_VALUES = [5, 4, 3, 2, 1] as const;
export type MarkValue = (typeof MARK_VALUES)[number];

export function isMarkValue(n: number): n is MarkValue {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

function parts(iso: string): { year: number; month: number } {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/** Год начала учебного года: 2026-11-17 → 2026, 2027-01-20 → 2026, 2027-03-01 → 2026. */
export function academicYearStart(iso: string): number {
  const { year, month } = parts(iso);
  return month >= 9 ? year : year - 1;
}

/** 1 — осенний семестр (сентябрь–январь), 2 — весенний (февраль–август). */
export function semesterHalf(iso: string): 1 | 2 {
  const { month } = parts(iso);
  return month >= 9 || month === 1 ? 1 : 2;
}

/** Границы семестра, в который попадает дата (включительно). */
export function semesterRange(iso: string): { from: string; to: string } {
  const y = academicYearStart(iso);
  if (semesterHalf(iso) === 1) {
    return { from: `${y}-09-01`, to: `${y + 1}-01-31` };
  }
  return { from: `${y + 1}-02-01`, to: `${y + 1}-08-31` };
}

/**
 * Номер семестра студента (1, 2, 3…), к которому относится дата.
 * Курс студента — на «сегодня»: в текущем учебном году он учится на курсе `course`,
 * годом раньше — на курсе `course − 1` и т. д. Результат < 1 — дата до начала обучения.
 */
export function studentSemesterNo(course: number, today: string, date: string): number {
  const yearsAgo = academicYearStart(today) - academicYearStart(date);
  return 2 * (course - 1 - yearsAgo) + semesterHalf(date);
}

/** Среднее с округлением до сотых; null — нет оценок. */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/** Итоговая оценка из ведомости (Grade.value) → число; «зачтено» и пустые — null. */
export function numericGrade(value: string | null): number | null {
  if (!value || !/^[1-5]$/.test(value)) return null;
  return Number(value);
}

/** «4,35» — средний балл по-русски; null → «—». */
export function formatAverage(value: number | null): string {
  return value == null ? "—" : value.toFixed(2).replace(".", ",");
}

/** «1 оценка», «3 оценки», «12 оценок». */
export function pluralMarks(n: number): string {
  return `${n} ${plural(n, ["оценка", "оценки", "оценок"])}`;
}

/**
 * Совпадает ли дата с тем, что набрал сотрудник в поле «Дата».
 * Принимает «12», «12.11», «12.11.2026», «12.11.26», «2026-11-12»; пустой ввод — любая дата.
 */
export function matchesDateQuery(iso: string, query: string): boolean {
  const q = query.trim().replace(/[/\-\s]/g, ".");
  if (!q) return true;
  if (/^\d{4}\./.test(q)) return iso.replace(/-/g, ".").startsWith(q);
  const [y, m, d] = iso.split("-");
  const full = `${d}.${m}.${y}`;
  const short = `${d}.${m}.${y!.slice(2)}`;
  // «5.11» → «05.11»
  const padded = q.replace(/^(\d)(?=\.|$)/, "0$1").replace(/\.(\d)(?=\.|$)/, ".0$1");
  return full.startsWith(padded) || short === padded;
}
