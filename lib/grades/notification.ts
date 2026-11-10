/**
 * Текст уведомления о новой оценке — один для серверного действия преподавателя и для seed.
 * «Новая оценка: Трансфигурация, 2-й срез — B (85)», ссылка на /grades.
 */
import { formatCredit, formatScored, scored } from "@/lib/grades/scale";
import { checkpointLabel } from "@/lib/grades/term";

export const GRADES_PATH = "/grades";

export type GradeNotificationInput =
  | { discipline: string; kind: "CHECKPOINT"; checkpoint: number; points: number; teacher?: string | null }
  | { discipline: string; kind: "EXAM"; points: number; teacher?: string | null }
  | { discipline: string; kind: "CREDIT"; passed: boolean; teacher?: string | null };

export function gradeNotification(g: GradeNotificationInput): { title: string; body: string; link: string } {
  const what = g.kind === "CHECKPOINT" ? checkpointLabel(g.checkpoint) : g.kind === "EXAM" ? "экзамен" : "зачёт";
  const value = g.kind === "CREDIT" ? formatCredit(g.passed) : formatScored(scored(g.points));
  return {
    title: `Новая оценка: ${g.discipline}, ${what} — ${value}`,
    body: [g.teacher ? `Преподаватель: ${g.teacher}.` : null, "Все оценки семестра — в разделе «Оценки»."].filter(Boolean).join(" "),
    link: GRADES_PATH,
  };
}
