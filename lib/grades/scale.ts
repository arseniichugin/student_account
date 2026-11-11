/**
 * Шкала оценок — болонская (ECTS), баллы 0–100 → буква, расшифровка, 5-балльный эквивалент.
 * ЕДИНСТВЕННОЕ место, где заданы границы и цвета: их читают слой данных, seed, экраны
 * студента и преподавателя и подсказка «Как считаются оценки». Другой вуз — другие границы здесь.
 * Модуль без серверного кода: годится и клиентским компонентам (мгновенная буква при вводе баллов).
 */

export type GradeLetter = "A" | "B" | "C" | "D" | "E" | "FX" | "F";

export type GradeScaleEntry = {
  letter: GradeLetter;
  /** Нижняя граница включительно */
  min: number;
  /** Верхняя граница включительно (для подсказки «90–100») */
  max: number;
  /** «отлично» */
  label: string;
  /** Традиционная оценка: 5, 4, 3, 2 */
  five: 2 | 3 | 4 | 5;
  /** Неудовлетворительно (FX, F) — «долг» */
  failing: boolean;
  /** Классы Tailwind для токенов --grade-*: текст, «плашка», заливка и обводка SVG */
  tone: { text: string; bg: string; fill: string; stroke: string };
  /** CSS-переменная цвета — для SVG-графиков и style */
  cssVar: string;
  cssVarSoft: string;
};

/** Таблица ECTS со 100-балльной шкалой (самая распространённая). Сверху вниз — от лучшей к худшей. */
export const GRADE_SCALE: readonly GradeScaleEntry[] = [
  {
    letter: "A",
    min: 90,
    max: 100,
    label: "отлично",
    five: 5,
    failing: false,
    tone: { text: "text-grade-a", bg: "bg-grade-a-soft", fill: "fill-grade-a", stroke: "stroke-grade-a" },
    cssVar: "var(--grade-a)",
    cssVarSoft: "var(--grade-a-soft)",
  },
  {
    letter: "B",
    min: 82,
    max: 89,
    label: "очень хорошо",
    five: 4,
    failing: false,
    tone: { text: "text-grade-b", bg: "bg-grade-b-soft", fill: "fill-grade-b", stroke: "stroke-grade-b" },
    cssVar: "var(--grade-b)",
    cssVarSoft: "var(--grade-b-soft)",
  },
  {
    letter: "C",
    min: 75,
    max: 81,
    label: "хорошо",
    five: 4,
    failing: false,
    tone: { text: "text-grade-c", bg: "bg-grade-c-soft", fill: "fill-grade-c", stroke: "stroke-grade-c" },
    cssVar: "var(--grade-c)",
    cssVarSoft: "var(--grade-c-soft)",
  },
  {
    letter: "D",
    min: 67,
    max: 74,
    label: "удовлетворительно",
    five: 3,
    failing: false,
    tone: { text: "text-grade-d", bg: "bg-grade-d-soft", fill: "fill-grade-d", stroke: "stroke-grade-d" },
    cssVar: "var(--grade-d)",
    cssVarSoft: "var(--grade-d-soft)",
  },
  {
    letter: "E",
    min: 60,
    max: 66,
    label: "достаточно",
    five: 3,
    failing: false,
    tone: { text: "text-grade-e", bg: "bg-grade-e-soft", fill: "fill-grade-e", stroke: "stroke-grade-e" },
    cssVar: "var(--grade-e)",
    cssVarSoft: "var(--grade-e-soft)",
  },
  {
    letter: "FX",
    min: 35,
    max: 59,
    label: "неудовлетворительно, можно пересдать",
    five: 2,
    failing: true,
    tone: { text: "text-grade-fx", bg: "bg-grade-fx-soft", fill: "fill-grade-fx", stroke: "stroke-grade-fx" },
    cssVar: "var(--grade-fx)",
    cssVarSoft: "var(--grade-fx-soft)",
  },
  {
    letter: "F",
    min: 0,
    max: 34,
    label: "неудовлетворительно, нужно повторить курс",
    five: 2,
    failing: true,
    tone: { text: "text-grade-f", bg: "bg-grade-f-soft", fill: "fill-grade-f", stroke: "stroke-grade-f" },
    cssVar: "var(--grade-f)",
    cssVarSoft: "var(--grade-f-soft)",
  },
];

export const MIN_POINTS = 0;
export const MAX_POINTS = 100;

const BY_LETTER = new Map(GRADE_SCALE.map((e) => [e.letter, e]));

/** Запись шкалы по букве. */
export function scaleEntry(letter: GradeLetter): GradeScaleEntry {
  return BY_LETTER.get(letter)!;
}

/** Целые баллы 0–100 — то, что можно сохранить. */
export function isValidPoints(points: unknown): points is number {
  return typeof points === "number" && Number.isInteger(points) && points >= MIN_POINTS && points <= MAX_POINTS;
}

/**
 * Буква по баллам. Дробные (средние) — по нижним границам: 89,5 → B (нужно 90 для A).
 * Баллы вне 0–100 или не число → ошибка: это ошибка программы, а не ввода (ввод проверяет Zod).
 */
export function gradeFor(points: number): GradeScaleEntry {
  if (!Number.isFinite(points) || points < MIN_POINTS || points > MAX_POINTS) {
    throw new RangeError(`Баллы должны быть от ${MIN_POINTS} до ${MAX_POINTS}: ${points}`);
  }
  return GRADE_SCALE.find((e) => points >= e.min)!;
}

export function letterFor(points: number): GradeLetter {
  return gradeFor(points).letter;
}

/** Баллы с буквой — то, что показывают экраны. */
export type ScoredGrade = { points: number; letter: GradeLetter };

export function scored(points: number): ScoredGrade {
  return { points, letter: letterFor(points) };
}

/** Округление до 1 знака: 84,25 → 84,3. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Средний балл по дисциплине: среднее арифметическое ВЫСТАВЛЕННЫХ срезов (пустые не считаются),
 * до 1 знака. Ни одного среза — null («нет оценок», а не 0).
 */
export function averagePoints(points: readonly (number | null | undefined)[]): number | null {
  const given = points.filter((p): p is number => typeof p === "number");
  if (given.length === 0) return null;
  return round1(given.reduce((a, b) => a + b, 0) / given.length);
}

/**
 * Итоговый балл по всем дисциплинам — «среднее из средних» (без весов) по дисциплинам,
 * у которых есть хотя бы один срез. Итоговые экзамены и зачёты сюда не входят.
 */
export function overallAverage(disciplineAverages: readonly (number | null | undefined)[]): number | null {
  return averagePoints(disciplineAverages);
}

/** Средний с буквой или null. */
export function scoredAverage(points: readonly (number | null | undefined)[]): ScoredGrade | null {
  const avg = averagePoints(points);
  return avg === null ? null : scored(avg);
}

/** «84,3» — баллы по-русски (запятая), целые без «,0». */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1).replace(".", ",");
}

/** «B (85)» — для уведомлений и подписей. */
export function formatScored(g: ScoredGrade): string {
  return `${g.letter} (${formatPoints(g.points)})`;
}

/** «зачтено» / «не зачтено». */
export function formatCredit(passed: boolean): string {
  return passed ? "зачтено" : "не зачтено";
}
