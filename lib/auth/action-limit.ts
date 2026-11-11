import "server-only";

// Ограничение частоты серверных действий (например, сохранения оценок) — в памяти процесса.
// Почему не в базе, как лимит входа (lib/auth/rate-limit.ts): проверка и учёт здесь — одна синхронная
// операция, поэтому параллельные запросы не проскакивают мимо счётчика, и не нужна новая таблица.
// Ограничения: счётчики обнуляются при перезапуске сервера и не делятся между экземплярами приложения —
// для прототипа с одним контейнером этого достаточно (задача — не дать «сломать» общий демо-аккаунт).

type Hit = { at: number; weight: number };
type Store = Map<string, Hit[]>;

// В режиме разработки Next.js перезагружает модули — храним счётчики в globalThis, как клиент базы.
const globalStore = globalThis as unknown as { actionLimitStore?: Store };
const store: Store = (globalStore.actionLimitStore ??= new Map());

export type LimitResult = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * Скользящее окно: можно ли сейчас потратить `weight` единиц из `limit` за `windowMs` по ключу `key`.
 * Если можно — расход записывается сразу (проверка и учёт атомарны в пределах процесса).
 * Если нельзя — ничего не записывается, возвращается, через сколько освободится место.
 */
export function takeActionLimit(key: string, limit: number, windowMs: number, weight = 1): LimitResult {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((h) => now - h.at < windowMs);
  let used = hits.reduce((n, h) => n + h.weight, 0);
  if (used + weight > limit) {
    // Ждать, пока из окна не уйдёт столько старых расходов, чтобы поместился новый
    let retryAfterMs = windowMs;
    for (const h of hits) {
      used -= h.weight;
      if (used + weight <= limit) {
        retryAfterMs = h.at + windowMs - now;
        break;
      }
    }
    store.set(key, hits);
    return { ok: false, retryAfterMs: Math.max(1000, retryAfterMs) };
  }
  hits.push({ at: now, weight });
  store.set(key, hits);
  // Не копим ключи бесконечно: изредка выбрасываем пустые
  if (store.size > 5000) for (const [k, v] of store) if (v.every((h) => now - h.at >= windowMs)) store.delete(k);
  return { ok: true };
}

/** Для тестов: забыть все расходы по ключу (или все ключи). */
export function resetActionLimit(key?: string) {
  if (key === undefined) store.clear();
  else store.delete(key);
}
