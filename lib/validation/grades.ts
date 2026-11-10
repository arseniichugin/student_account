import { z } from "zod";
import { MAX_POINTS, MIN_POINTS } from "@/lib/grades/scale";

// Схемы ввода оценок. Без серверного кода: клиентский журнал может проверять поле сразу,
// но сервер (lib/data/grades.ts → saveGrades) всё равно проверяет то же самое заново.

const POINTS_MESSAGE = `Баллы — целое число от ${MIN_POINTS} до ${MAX_POINTS}`;

export const pointsSchema = z
  .number({ error: POINTS_MESSAGE })
  .int(POINTS_MESSAGE)
  .min(MIN_POINTS, POINTS_MESSAGE)
  .max(MAX_POINTS, POINTS_MESSAGE);

const studentId = z.string({ error: "Не указан студент" }).min(1, "Не указан студент").max(64, "Не указан студент");

/**
 * Одна оценка. null вместо значения — стереть ранее выставленную оценку.
 *  — срез: checkpoint 1–3, points 0–100;
 *  — экзамен: points 0–100;
 *  — зачёт: passed true/false.
 */
export const gradeEntrySchema = z.discriminatedUnion(
  "kind",
  [
    z.object({
      studentId,
      kind: z.literal("CHECKPOINT"),
      checkpoint: z.union([z.literal(1), z.literal(2), z.literal(3)], { error: "Срез — 1, 2 или 3" }),
      points: pointsSchema.nullable(),
    }),
    z.object({ studentId, kind: z.literal("EXAM"), points: pointsSchema.nullable() }),
    z.object({ studentId, kind: z.literal("CREDIT"), passed: z.boolean({ error: "Зачтено или не зачтено" }).nullable() }),
  ],
  { error: "Вид оценки — срез, экзамен или зачёт" },
);

/** Сколько оценок можно сохранить за раз: группа целиком (до ~30 человек) с запасом. */
export const MAX_GRADES_PER_SAVE = 100;

export const saveGradesSchema = z.object({
  assignmentId: z.string({ error: "Журнал не найден" }).min(1, "Журнал не найден").max(64, "Журнал не найден"),
  entries: z
    .array(gradeEntrySchema)
    .min(1, "Нечего сохранять")
    .max(MAX_GRADES_PER_SAVE, `За один раз — не больше ${MAX_GRADES_PER_SAVE} оценок`),
});

export type GradeEntryInput = z.infer<typeof gradeEntrySchema>;
export type SaveGradesInput = z.infer<typeof saveGradesSchema>;

/**
 * Текст из поля ввода баллов → число для saveGrades. Пустое поле — null (стереть оценку).
 * Для мгновенной проверки в журнале; сервер проверяет заново.
 */
export function parsePointsInput(text: string): { ok: true; points: number | null } | { ok: false; error: string } {
  const t = text.trim();
  if (t === "") return { ok: true, points: null };
  if (!/^\d{1,3}$/.test(t)) return { ok: false, error: POINTS_MESSAGE };
  const parsed = pointsSchema.safeParse(Number(t));
  return parsed.success ? { ok: true, points: parsed.data } : { ok: false, error: POINTS_MESSAGE };
}
