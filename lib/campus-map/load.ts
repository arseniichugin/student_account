import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { campusMapSchema, describeIssues, type CampusMapData } from "./schema";

const FILE_NAME = "campus-map.json";
const MAX_BYTES = 5 * 1024 * 1024;

export type CampusMapResult = { ok: true; data: CampusMapData } | { ok: false; error: string };

/** Папка с заменяемыми файлами вуза: env UNIVERSITY_DATA_DIR или <корень проекта>/data/university. */
export function universityDataDir(): string {
  return process.env.UNIVERSITY_DATA_DIR || path.join(process.cwd(), "data", "university");
}

/**
 * Читает campus-map.json при каждом запросе (файл можно заменить без пересборки)
 * и проверяет структуру. Никогда не бросает исключение: ошибка возвращается текстом
 * для пользователя — страница покажет состояние ошибки, а не упадёт.
 */
export async function loadCampusMap(): Promise<CampusMapResult> {
  const file = path.join(universityDataDir(), FILE_NAME);
  let raw: string;
  try {
    const info = await stat(file);
    if (info.size > MAX_BYTES) return { ok: false, error: `файл ${FILE_NAME} слишком большой` };
    raw = await readFile(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { ok: false, error: code === "ENOENT" ? `файл ${FILE_NAME} не найден` : `файл ${FILE_NAME} не читается` };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: `файл ${FILE_NAME} повреждён (это не JSON)` };
  }

  const parsed = campusMapSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `в файле ${FILE_NAME} неверные данные — ${describeIssues(parsed.error)}` };
  }
  return { ok: true, data: parsed.data };
}
