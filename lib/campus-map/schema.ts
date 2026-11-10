import { z } from "zod";
import { normalizeRoomNumber } from "./rooms";

// Схема заменяемого файла data/university/campus-map.json.
// Файл приходит извне (его можно подменить без пересборки), поэтому проверяем
// структуру перед тем, как отдать данные карте. Лишние поля допустимы — генератор может
// добавлять новые сведения, не ломая кабинет, — но z.object их ОТБРАСЫВАЕТ: данные уходят
// в браузер (props клиентского компонента карты), и туда попадают только известные поля.
// Новое поле для карты — сначала добавить в схему.

const text = (max = 300) => z.string().trim().min(1).max(max);

export const campusBuildingSchema = z.object({
  id: text(64),
  name: text(),
  abbr: text(16),
  address: text(),
  floors: z.array(z.number().int().min(-5).max(100)).min(1).max(100),
  wings: z.array(z.number().int().min(0).max(20).nullable()).max(20).default([null]),
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
    const buildings = new Map<string, z.infer<typeof campusBuildingSchema>>();
    data.buildings.forEach((b, i) => {
      if (buildings.has(b.id)) {
        ctx.addIssue({ code: "custom", path: ["buildings", i, "id"], message: `Корпус «${b.id}» указан дважды` });
      }
      buildings.set(b.id, b);
    });
    const numbers = new Set<string>();
    data.rooms.forEach((r, i) => {
      const b = buildings.get(r.building);
      if (!b) {
        ctx.addIssue({ code: "custom", path: ["rooms", i, "building"], message: `Неизвестный корпус «${r.building}»` });
      } else if (!b.floors.includes(r.floor)) {
        ctx.addIssue({ code: "custom", path: ["rooms", i, "floor"], message: `В корпусе «${b.id}» нет этажа ${r.floor}` });
      }
      const key = normalizeRoomNumber(r.number);
      if (numbers.has(key)) {
        ctx.addIssue({ code: "custom", path: ["rooms", i, "number"], message: `Помещение «${r.number}» указано дважды` });
      }
      numbers.add(key);
    });
  });

export type CampusMapData = z.infer<typeof campusMapSchema>;
export type CampusRoom = z.infer<typeof campusRoomSchema>;
export type CampusBuilding = z.infer<typeof campusBuildingSchema>;

/** Короткое описание ошибок проверки для человека: «rooms[3].number: …». */
export function describeIssues(error: z.ZodError, limit = 3): string {
  const lines = error.issues.slice(0, limit).map((issue) => {
    const where = issue.path
      .map((p, i) => (typeof p === "number" ? `[${p}]` : `${i ? "." : ""}${String(p)}`))
      .join("");
    return where ? `${where}: ${issue.message}` : issue.message;
  });
  const more = error.issues.length - limit;
  return lines.join("; ") + (more > 0 ? ` и ещё ${more}` : "");
}
