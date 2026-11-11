/**
 * Учебный период для успеваемости: учебный год, сезон, номер семестра по курсу, сроки срезов.
 * ЕДИНСТВЕННОЕ место, где задан текущий семестр: новый семестр — поменять константы здесь.
 * Модуль без серверного кода: годится и клиентским компонентам, и seed.
 */

export type Season = "autumn" | "spring";

/** Текущий период: осенний семестр 2026/27 учебного года. */
export const CURRENT_TERM = {
  /** Год начала учебного года: 2026 → «2026/27» */
  yearStart: 2026,
  season: "autumn" as Season,
} as const;

export type CheckpointNo = 1 | 2 | 3;

export const CHECKPOINT_NUMBERS: readonly CheckpointNo[] = [1, 2, 3];

/** Три среза текущего семестра и ориентировочные сроки — для подписи в интерфейсе. */
export const CHECKPOINTS: readonly { no: CheckpointNo; label: string; short: string; due: string }[] = [
  { no: 1, label: "1-й срез", short: "1-й", due: "2026-10-10" },
  { no: 2, label: "2-й срез", short: "2-й", due: "2026-11-15" },
  { no: 3, label: "3-й срез", short: "3-й", due: "2026-12-15" },
];

/** «2026/27» */
export function academicYearLabel(yearStart: number = CURRENT_TERM.yearStart): string {
  return `${yearStart}/${String((yearStart + 1) % 100).padStart(2, "0")}`;
}

/** «осенний семестр 2026/27» */
export function termLabel(term: { yearStart: number; season: Season } = CURRENT_TERM): string {
  return `${term.season === "autumn" ? "осенний" : "весенний"} семестр ${academicYearLabel(term.yearStart)}`;
}

/**
 * Номер семестра студента по курсу: осенью 2 × (курс − 1) + 1, весной 2 × курс.
 * 1 курс осенью — 1-й семестр, 2 курс осенью — 3-й.
 */
export function semesterForCourse(course: number, season: Season = CURRENT_TERM.season): number {
  if (!Number.isInteger(course) || course < 1) throw new RangeError(`Курс должен быть целым числом от 1: ${course}`);
  return season === "autumn" ? 2 * (course - 1) + 1 : 2 * course;
}

/** Все семестры студента до текущего включительно: [1, 2, 3] для 2 курса осенью. */
export function semestersUpTo(course: number, season: Season = CURRENT_TERM.season): number[] {
  return Array.from({ length: semesterForCourse(course, season) }, (_, i) => i + 1);
}

/** «3-й семестр» */
export function semesterLabel(semester: number): string {
  return `${semester}-й семестр`;
}

/** «1-й срез» */
export function checkpointLabel(no: number): string {
  return CHECKPOINTS.find((c) => c.no === no)?.label ?? `${no}-й срез`;
}

export function isCheckpointNo(n: unknown): n is CheckpointNo {
  return n === 1 || n === 2 || n === 3;
}

/**
 * Идущий срез: первый, срок которого ещё не прошёл (дата «YYYY-MM-DD» по Москве).
 * После срока 3-го среза — null (семестр закончился, впереди сессия).
 */
export function currentCheckpoint(today: string): CheckpointNo | null {
  return CHECKPOINTS.find((c) => today <= c.due)?.no ?? null;
}

/** «Экзамен» / «Зачёт» */
export const FINAL_KIND_LABEL = { EXAM: "Экзамен", CREDIT: "Зачёт" } as const;
