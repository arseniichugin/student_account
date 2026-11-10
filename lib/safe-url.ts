/**
 * Внешняя ссылка из данных (например, на онлайн-занятие из schedule.csv) — только http(s).
 * Импорт уже не пропускает другие схемы, но страница проверяет ещё раз при отрисовке:
 * данные в базе могли попасть туда в обход импорта, а `javascript:` в href выполнится по клику.
 * Возвращает нормализованный адрес или null, если ссылку показывать нельзя.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null; // относительный или битый адрес
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
}
