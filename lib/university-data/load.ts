import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  MAP_FILE,
  SCHEDULE_FILE,
  STUDENTS_FILE,
  validateUniversityData,
  type Issue,
  type ValidationResult,
} from "./validate";

/** Папка с файлами вуза по умолчанию (относительно корня репозитория). */
export const DEFAULT_DATA_DIR = "data/university";

/**
 * Предел размера каждого файла. Основной набор — несколько мегабайт (расписание ~8 МБ);
 * файл в сотни мегабайт — почти наверняка ошибка, и читать его в память целиком не стоит.
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** Читает students.csv, schedule.csv и campus-map.json из папки и проверяет их. */
export function loadUniversityData(dir: string, maxBytes = MAX_FILE_BYTES): ValidationResult {
  const files = [STUDENTS_FILE, SCHEDULE_FILE, MAP_FILE];
  const tooBig: Issue[] = [];
  for (const name of files) {
    const file = path.join(dir, name);
    if (!existsSync(file)) continue;
    const size = statSync(file).size;
    if (size > maxBytes) {
      const mb = (n: number) => (n / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
      tooBig.push({
        file: name,
        message: `файл слишком большой: ${mb(size)} МБ, допустимо не больше ${mb(maxBytes)} МБ. Проверьте, тот ли это файл`,
      });
    }
  }
  // Слишком большой файл не читаем в память вовсе
  if (tooBig.length > 0) return { ok: false, errors: tooBig, errorCount: tooBig.length, warnings: [], warningCount: 0 };

  return validateUniversityData({
    students: readIfExists(path.join(dir, STUDENTS_FILE)),
    schedule: readIfExists(path.join(dir, SCHEDULE_FILE)),
    map: readIfExists(path.join(dir, MAP_FILE)),
  });
}
