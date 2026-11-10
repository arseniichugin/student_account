import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { universityDataDir } from "@/lib/university-data/load";
import {
  CAMPUS_MAP_FILE as FILE_NAME,
  CAMPUS_MAP_MAX_BYTES,
  describeIssues,
  parseCampusMap,
  type CampusMapData,
} from "./schema";

export type CampusMapResult = { ok: true; data: CampusMapData } | { ok: false; error: string };

/**
 * Читает campus-map.json при каждом запросе (файл можно заменить без пересборки)
 * и проверяет той же схемой, что и импорт. Никогда не бросает исключение: ошибка возвращается
 * текстом для пользователя — страница покажет состояние ошибки, а не упадёт.
 */
export async function loadCampusMap(): Promise<CampusMapResult> {
  const file = path.join(universityDataDir(), FILE_NAME);
  let raw: string;
  try {
    const info = await stat(file);
    if (info.size > CAMPUS_MAP_MAX_BYTES) return { ok: false, error: `файл ${FILE_NAME} слишком большой` };
    raw = await readFile(file, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { ok: false, error: code === "ENOENT" ? `файл ${FILE_NAME} не найден` : `файл ${FILE_NAME} не читается` };
  }

  const parsed = parseCampusMap(raw);
  if (parsed.ok) return { ok: true, data: parsed.data };
  if (parsed.reason === "json") return { ok: false, error: `файл ${FILE_NAME} повреждён (это не JSON)` };
  return { ok: false, error: `в файле ${FILE_NAME} неверные данные — ${describeIssues(parsed.issues)}` };
}
