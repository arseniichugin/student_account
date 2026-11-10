"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/guards";
import { getJournal, saveGrades, type Journal, type SaveGradesResult } from "@/lib/data/grades";
import type { SaveGradesInput } from "@/lib/validation/grades";

/**
 * Сохранить оценки журнала: одну, строку студента или колонку среза — до 100 за раз.
 * Вызывается из клиентского компонента напрямую: `await saveGradesAction({ assignmentId, entries })`.
 * Преподаватель — только из сессии (requireTeacher); ввод проверяется заново на сервере (saveGrades),
 * тип параметра — подсказка для интерфейса, а не гарантия.
 */
export async function saveGradesAction(input: SaveGradesInput): Promise<SaveGradesResult> {
  const ctx = await requireTeacher(); // без входа — redirect на /login (его не ловим)
  let result: SaveGradesResult;
  try {
    result = await saveGrades(ctx, input);
  } catch (e) {
    // Сбой базы, истёк срок транзакции и т. п.: понятный ответ вместо «нет связи с сервером» в журнале.
    // В журнал сервера — только текст ошибки, без ввода преподавателя.
    console.error("saveGradesAction failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Сервер не смог сохранить оценки. Попробуйте через минуту", fieldErrors: [] };
  }
  // Список журналов показывает прогресс по срезам — пусть при возврате к нему он будет свежим
  if (result.ok && result.saved + result.cleared > 0) revalidatePath("/journal");
  return result;
}

/**
 * Свежие данные журнала группы — когда преподаватель вернулся на вкладку, а несохранённых оценок нет:
 * журнал покажет то, что сейчас в базе (вторая вкладка, второй семинарист). Чужой или несуществующий id → null.
 */
export async function loadJournalAction(assignmentId: string): Promise<Journal | null> {
  const ctx = await requireTeacher();
  return getJournal(ctx, typeof assignmentId === "string" ? assignmentId : "");
}
