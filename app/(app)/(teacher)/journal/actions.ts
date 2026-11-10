"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/guards";
import { saveGrades, type SaveGradesResult } from "@/lib/data/grades";
import type { SaveGradesInput } from "@/lib/validation/grades";

/**
 * Сохранить оценки журнала: одну, строку студента или колонку среза — до 100 за раз.
 * Вызывается из клиентского компонента напрямую: `await saveGradesAction({ assignmentId, entries })`.
 * Преподаватель — только из сессии (requireTeacher); ввод проверяется заново на сервере (saveGrades),
 * тип параметра — подсказка для интерфейса, а не гарантия.
 */
export async function saveGradesAction(input: SaveGradesInput): Promise<SaveGradesResult> {
  const ctx = await requireTeacher();
  const result = await saveGrades(ctx, input);
  // Список журналов показывает прогресс по срезам — пусть при возврате к нему он будет свежим
  if (result.ok && result.saved > 0) revalidatePath("/journal");
  return result;
}
