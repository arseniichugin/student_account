/**
 * Ссылка на аудиторию на карте кампуса: roomMapHref("3041") → "/map?room=3041".
 * Номера с кириллицей и дефисом («Обсерватория-1», «Манеж-2») кодируются.
 */
export function roomMapHref(room: string): string {
  return `/map?room=${encodeURIComponent(room.trim())}`;
}
