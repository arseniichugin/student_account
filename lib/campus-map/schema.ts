import { z } from "zod";
import { normalizeRoomNumber } from "./rooms";

// Схема заменяемого файла data/university/campus-map.json — ЕДИНСТВЕННЫЙ источник правды:
// её используют и страница /map (lib/campus-map/load.ts), и импорт (lib/university-data/validate.ts).
// Файл приходит извне (его можно подменить без пересборки), поэтому проверяем
// структуру перед тем, как отдать данные карте. Лишние поля допустимы — генератор может
// добавлять новые сведения, не ломая кабинет, — но z.object их ОТБРАСЫВАЕТ: данные уходят
// в браузер (props клиентского компонента карты), и туда попадают только известные поля.
// Новое поле для карты — сначала добавить в схему.
// Модуль без server-only: его импортирует скрипт `npm run data:import` (tsx).

export const CAMPUS_MAP_FILE = "campus-map.json";

/** Предел размера campus-map.json: и для страницы карты, и для импорта. Основной файл — ~60 КБ. */
export const CAMPUS_MAP_MAX_BYTES = 5 * 1024 * 1024;

const text = (max = 300) => z.string().trim().min(1).max(max);

export const campusBuildingSchema = z.object({
  id: text(64),
  name: text(),
  abbr: text(16),
  address: text(),
  floors: z.array(z.number().int().min(-5).max(100)).min(1).max(100),
  wings: z.array(z.number().int().min(0).max(20).nullable()).max(20).default([null]),
  /** Наибольший номер помещения на этаже — подсказка для схемы нумерации */
  maxRoom: z.number().int().min(0).max(100_000).nullable().optional(),
  scheme: z.string().max(300).default(""),
});

export const campusRoomSchema = z.object({
  number: text(64),
  building: text(64),
  type: text(),
  floor: z.number().int().min(-5).max(100),
  wing: z.number().int().min(0).max(20).nullable().optional(),
  purpose: z.string().max(300).nullable().optional(),
  capacity: z.number().int().min(0).max(100_000).nullable().optional(),
  bookable: z.boolean().optional(),
});

export const campusMapSchema = z
  .object({
    buildings: z.array(campusBuildingSchema).min(1).max(50),
    rooms: z.array(campusRoomSchema).max(10_000),
  })
  .superRefine((data, ctx) => {
    const buildings = new Map<string, { index: number; floors: number[] }>();
    const buildingNames = new Map<string, number>();
    data.buildings.forEach((b, i) => {
      const prev = buildings.get(b.id);
      if (prev) {
        const message = `корпус «${b.id}» уже есть в buildings[${prev.index}] — id корпусов должны быть уникальными`;
        ctx.addIssue({ code: "custom", path: ["buildings", i, "id"], message });
      } else buildings.set(b.id, { index: i, floors: b.floors });
      // Название — ключ, по которому расписание (колонка building) находит корпус на карте.
      const prevName = buildingNames.get(b.name);
      if (prevName !== undefined) {
        const message = `название «${b.name}» уже есть в buildings[${prevName}] — названия корпусов должны быть уникальными`;
        ctx.addIssue({ code: "custom", path: ["buildings", i, "name"], message });
      } else buildingNames.set(b.name, i);
    });
    // Номера сравниваются так же, как их ищет карта: без учёта регистра, «ё» и лишних пробелов.
    const numbers = new Map<string, number>();
    data.rooms.forEach((r, i) => {
      const b = buildings.get(r.building);
      if (!b) {
        const message = `корпуса «${r.building}» нет в списке buildings`;
        ctx.addIssue({ code: "custom", path: ["rooms", i, "building"], message });
      } else if (!b.floors.includes(r.floor)) {
        const message = `в корпусе «${r.building}» нет этажа ${r.floor} (этажи — поле floors корпуса)`;
        ctx.addIssue({ code: "custom", path: ["rooms", i, "floor"], message });
      }
      const key = normalizeRoomNumber(r.number);
      const prev = numbers.get(key);
      if (prev !== undefined) {
        const message = `номер «${r.number}» уже есть в rooms[${prev}] — номера должны быть уникальными`;
        ctx.addIssue({ code: "custom", path: ["rooms", i, "number"], message });
      } else numbers.set(key, i);
    });
  });

export type CampusMapData = z.infer<typeof campusMapSchema>;
export type CampusRoom = z.infer<typeof campusRoomSchema>;
export type CampusBuilding = z.infer<typeof campusBuildingSchema>;
export type CampusMapIssue = z.core.$ZodIssue;

// Сообщения по-русски только для этой проверки: глобальные настройки Zod не трогаем.
const ruErrors = z.locales.ru().localeError;
const mapErrors: z.core.$ZodErrorMap = (iss) =>
  iss.code === "invalid_type" && iss.input === undefined ? "обязательное поле не заполнено" : ruErrors(iss);

export type CampusMapParseResult =
  | { ok: true; data: CampusMapData }
  | { ok: false; reason: "json"; message: string }
  | { ok: false; reason: "schema"; issues: CampusMapIssue[] };

/**
 * Разбирает текст campus-map.json (BOM в начале допускается — так сохраняют некоторые редакторы)
 * и проверяет схемой. Одна функция для страницы карты и для импорта: что принял импорт, примет и карта.
 */
export function parseCampusMap(source: string): CampusMapParseResult {
  let json: unknown;
  try {
    json = JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
  } catch (e) {
    return { ok: false, reason: "json", message: (e as Error).message };
  }
  const parsed = campusMapSchema.safeParse(json, { error: mapErrors });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "schema", issues: parsed.error.issues };
}

/** Путь к полю для человека: ["rooms", 3, "number"] → «rooms[3].number». */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : `${i ? "." : ""}${String(p)}`)).join("");
}

/** Короткое описание ошибок проверки для человека: «rooms[3].number: …». */
export function describeIssues(issues: readonly CampusMapIssue[], limit = 3): string {
  const lines = issues.slice(0, limit).map((issue) => {
    const where = formatIssuePath(issue.path);
    return where ? `${where}: ${issue.message}` : issue.message;
  });
  const more = issues.length - limit;
  return lines.join("; ") + (more > 0 ? ` и ещё ${more}` : "");
}
