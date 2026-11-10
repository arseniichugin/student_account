/**
 * Чистые функции экрана «Оценки» студента: проблемные дисциплины, средние по срезам для графика,
 * масштаб графика, подписи «через N дней» и «84,3 балла». Без серверного кода и без базы:
 * их читают страница /grades, блок на «Сегодня» и слой данных (getMyGradesDigest).
 */
import { averagePoints, overallAverage, scaleEntry, scored, type GradeLetter, type ScoredGrade } from "@/lib/grades/scale";
import { CHECKPOINTS, type CheckpointNo } from "@/lib/grades/term";
import { daysBetweenIso } from "@/lib/moscow-time";
import { plural } from "@/lib/utils";

type Cell = ScoredGrade | null;
type Final = { kind: "EXAM"; points: number; letter: GradeLetter } | { kind: "CREDIT"; passed: boolean } | null;

/** То, что нужно функциям из карточки дисциплины (MyDisciplineGrades подходит). */
export type DisciplineLike = { checkpoints: readonly Cell[]; finalResult: Final };

export const isFailingLetter = (letter: GradeLetter): boolean => scaleEntry(letter).failing;

/** Неудовлетворительные оценки дисциплины: номера срезов с FX/F и «провален ли» итоговый контроль. */
export function disciplineIssues(d: DisciplineLike): { checkpoints: CheckpointNo[]; final: boolean } {
  const checkpoints = d.checkpoints.flatMap((c, i) => (c && isFailingLetter(c.letter) ? [(i + 1) as CheckpointNo] : []));
  const f = d.finalResult;
  const final = !!f && (f.kind === "CREDIT" ? !f.passed : isFailingLetter(f.letter));
  return { checkpoints, final };
}

export const hasFailing = (d: DisciplineLike): boolean => {
  const i = disciplineIssues(d);
  return i.checkpoints.length > 0 || i.final;
};

export type CheckpointStat = {
  no: CheckpointNo;
  label: string;
  due: string;
  /** Средний балл по дисциплинам, где срез выставлен; null — срез ещё нигде не выставлен */
  average: ScoredGrade | null;
  /** У скольких дисциплин срез выставлен */
  graded: number;
  total: number;
  /** Баллы по дисциплинам (для «разброса» на графике) */
  points: number[];
};

/** Динамика по срезам: средний балл за 1-й, 2-й, 3-й срез по всем дисциплинам, где срез выставлен. */
export function checkpointStats(disciplines: readonly DisciplineLike[]): CheckpointStat[] {
  return CHECKPOINTS.map((c, i) => {
    const points = disciplines.flatMap((d) => (d.checkpoints[i] ? [d.checkpoints[i]!.points] : []));
    const avg = averagePoints(points);
    return {
      no: c.no,
      label: c.label,
      due: c.due,
      average: avg === null ? null : scored(avg),
      graded: points.length,
      total: disciplines.length,
      points,
    };
  });
}

/**
 * Нижняя граница шкалы графика динамики: 50, а если есть баллы ниже — кратное 10 с запасом 5 баллов
 * (45 → 40, 32 → 20). Так обычный семестр (60–100) занимает весь график, а FX/F не «вылезают» вниз.
 */
export function chartFloor(points: readonly number[]): number {
  if (points.length === 0) return 50;
  const min = Math.min(...points);
  return Math.max(0, Math.min(50, Math.floor((min - 5) / 10) * 10));
}

/** «сегодня», «завтра», «через 5 дней»; прошедшие даты — «5 дней назад». */
export function daysUntilLabel(today: string, date: string): string {
  const n = daysBetweenIso(today, date);
  if (n === 0) return "сегодня";
  if (n === 1) return "завтра";
  const days = (k: number) => `${k} ${plural(k, ["день", "дня", "дней"])}`;
  return n > 0 ? `через ${days(n)}` : `${days(-n)} назад`;
}

/** «балл», «балла», «баллов»; дробные — «балла» (84,3 балла). */
export function pointsWord(points: number): string {
  return Number.isInteger(points) ? plural(points, ["балл", "балла", "баллов"]) : "балла";
}

/**
 * Итоговый балл из строк оценок за срезы (без списка дисциплин): средний по каждой дисциплине,
 * затем «среднее из средних» — то же правило, что и в getMyGrades.
 */
export function overallFromCheckpoints(rows: readonly { disciplineId: string; points: number }[]): ScoredGrade | null {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.disciplineId, [...(by.get(r.disciplineId) ?? []), r.points]);
  const overall = overallAverage([...by.values()].map((p) => averagePoints(p)));
  return overall === null ? null : scored(overall);
}
