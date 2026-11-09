import type { CampusMapData, CampusRoom } from "./schema";

// Без zod: модуль импортирует клиентский компонент карты.

/** Нормализация номера так же, как в public/campus-map/campus-map.js (функция norm). */
export function normalizeRoomNumber(s: string): string {
  return String(s).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}
const norm = normalizeRoomNumber;

/**
 * Ищет помещение так же, как map.focus() в campus-map.js:
 * сначала точный номер (без учёта регистра и «ё»), затем часть названия («Ректорат»).
 */
export function findRoom(data: Pick<CampusMapData, "rooms">, query: string): CampusRoom | null {
  const q = norm(query);
  if (!q) return null;
  return (
    data.rooms.find((r) => norm(r.number) === q) ??
    data.rooms.find((r) => r.purpose && norm(r.purpose).includes(q)) ??
    null
  );
}
