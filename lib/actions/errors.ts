import "server-only";
import { unstable_rethrow } from "next/navigation";

/**
 * Обёртка серверного действия: ошибка сервера или базы не теряется молча,
 * а пишется в лог сервера (docker compose logs app) и возвращается в форму понятным текстом.
 * Перенаправления Next.js (redirect из requireStaff и т. п.) пробрасываются дальше как есть.
 */
export async function runAction<T>(name: string, fn: () => Promise<T>, onError: (message: string) => T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[action:${name}] ${errorSummary(e)}`);
    return onError(serverErrorMessage(e));
  }
}

/** Текст для пользователя. Не раскрывает подробностей, но отличает «база не обновлена» от прочих сбоев. */
export function serverErrorMessage(e: unknown): string {
  const text = e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e);
  if (/P2021|P2022|does not exist in the current database|ColumnNotFound|TableDoesNotExist/i.test(text)) {
    return "Не удалось сохранить: база данных не обновлена до новой версии кабинета. Администратору нужно применить миграции (см. docs/DEPLOYMENT.md).";
  }
  return "Не удалось сохранить из-за ошибки на сервере. Попробуйте ещё раз; если повторяется — сообщите администратору.";
}

/**
 * Одна строка об ошибке для лога: имя, код и суть — без аргументов запроса (в полном тексте ошибки Prisma
 * бывают данные людей). У Prisma суть — строка вида «The table `public.X` does not exist…», а не первая.
 */
export function errorSummary(e: unknown): string {
  const err = e as { name?: string; code?: string; message?: string };
  // Значения в двойных кавычках — это аргументы запроса (например, введённый логин): вырезаем
  const lines = String(err?.message ?? e)
    .split("\n")
    .map((l) => l.replace(/"(?:[^"\\]|\\.)*"/g, '"…"').trim())
    .filter(Boolean);
  const gist =
    lines.find((l) => /does not exist|not found|denied|refused|timed? ?out|unique constraint|foreign key/i.test(l)) ?? lines[0] ?? "";
  return `${err?.name ?? "Error"} ${err?.code ?? ""} ${gist.slice(0, 300)}`.replace(/\s+/g, " ").trim();
}
