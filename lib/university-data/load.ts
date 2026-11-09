import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MAP_FILE, SCHEDULE_FILE, STUDENTS_FILE, validateUniversityData, type ValidationResult } from "./validate";

/** Папка с файлами вуза по умолчанию (относительно корня репозитория). */
export const DEFAULT_DATA_DIR = "data/university";

function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** Читает students.csv, schedule.csv и campus-map.json из папки и проверяет их. */
export function loadUniversityData(dir: string): ValidationResult {
  return validateUniversityData({
    students: readIfExists(path.join(dir, STUDENTS_FILE)),
    schedule: readIfExists(path.join(dir, SCHEDULE_FILE)),
    map: readIfExists(path.join(dir, MAP_FILE)),
  });
}
