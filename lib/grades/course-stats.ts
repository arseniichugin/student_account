/**
 * Сводки успеваемости для деканата: курс или группа целиком. Чистые функции без базы — их считает
 * слой данных (lib/data/dean-grades.ts) из тех же оценок студентов, что видит сам студент
 * (buildSemesterGrades): средний по дисциплине, итоговый балл и долг (hasFailing) — одно правило.
 */
import { GRADE_SCALE, averagePoints, scored, type GradeLetter, type ScoredGrade } from "@/lib/grades/scale";
import { hasFailing, worstFailingLetter, type DisciplineLike } from "@/lib/grades/stats";
import type { CheckpointNo } from "@/lib/grades/term";

/** Дисциплина студента — то, что нужно сводке (MyDisciplineGrades подходит). */
export type StudentDiscipline = DisciplineLike & { disciplineId: string; discipline: string; average: ScoredGrade | null };

/** Оценки одного студента за семестр (MyGrades подходит). */
export type StudentResult = {
  /** Итоговый балл студента («среднее из средних») или null — оценок нет */
  overall: ScoredGrade | null;
  disciplines: readonly StudentDiscipline[];
};

/** Сколько студентов с итоговым баллом этой буквы; letter = null — «нет оценок». */
export type LetterCount = { letter: GradeLetter | null; count: number };

export type CohortSummary = {
  /** Всего студентов */
  students: number;
  /** Средний балл: «среднее из средних» — среднее итоговых баллов студентов, у которых они есть */
  average: ScoredGrade | null;
  /** Студентов с итоговым баллом (по ним посчитан средний) */
  graded: number;
  /** Распределение студентов по букве итогового балла: A … F, затем «нет оценок» */
  distribution: LetterCount[];
  /** Студентов хотя бы с одной дисциплиной с непогашенным FX/F (hasFailing) */
  withDebt: number;
  /** Срез, заполнение которого считаем (идущий; после срока 3-го — 3-й) */
  checkpoint: CheckpointNo;
  /** Заполнение среза: выставлено оценок из возможных (студент × его дисциплина) */
  fill: { graded: number; total: number };
};

/** Долг студента по дисциплине: худшая непогашенная буква (F важнее FX). */
export type DebtDiscipline = { disciplineId: string; discipline: string; letter: "FX" | "F" };

/** Дисциплины студента с непогашенным долгом — то же правило, что «Ниже порога» у самого студента. */
export function debtDisciplines(s: StudentResult): DebtDiscipline[] {
  return s.disciplines
    .filter(hasFailing)
    .map((d) => ({ disciplineId: d.disciplineId, discipline: d.discipline, letter: worstFailingLetter(d) ?? "FX" }));
}

/** Выставлен ли срез checkpoint по дисциплине. */
export const isCheckpointGraded = (d: DisciplineLike, checkpoint: CheckpointNo): boolean => d.checkpoints[checkpoint - 1] != null;

/** Сводка по набору студентов (курс, группа): средний, распределение, долги, заполнение среза. */
export function cohortSummary(students: readonly StudentResult[], checkpoint: CheckpointNo): CohortSummary {
  const overalls = students.flatMap((s) => (s.overall ? [s.overall] : []));
  const avg = averagePoints(overalls.map((o) => o.points));
  const distribution: LetterCount[] = [
    ...GRADE_SCALE.map((e) => ({ letter: e.letter, count: overalls.filter((o) => o.letter === e.letter).length })),
    { letter: null, count: students.length - overalls.length },
  ];
  return {
    students: students.length,
    average: avg === null ? null : scored(avg),
    graded: overalls.length,
    distribution,
    withDebt: students.filter((s) => s.disciplines.some(hasFailing)).length,
    checkpoint,
    fill: {
      graded: students.reduce((n, s) => n + s.disciplines.filter((d) => isCheckpointGraded(d, checkpoint)).length, 0),
      total: students.reduce((n, s) => n + s.disciplines.length, 0),
    },
  };
}

/** Средний балл группы по дисциплине: среднее из средних студентов, у которых он есть. */
export function disciplineAverage(students: readonly StudentResult[], disciplineId: string): ScoredGrade | null {
  const avg = averagePoints(students.map((s) => s.disciplines.find((d) => d.disciplineId === disciplineId)?.average?.points));
  return avg === null ? null : scored(avg);
}

/** Доля в процентах (целое), 0 при пустом знаменателе. */
export const percent = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 100) : 0);
