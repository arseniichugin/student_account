import "server-only";
import { db } from "@/lib/db";

export const WINDOW_MINUTES = 15;
/** Ошибок с одной пары «логин + IP» — основной лимит. */
export const MAX_FAILED_ATTEMPTS = 5;
/** Ошибок с одного IP по любым логинам. */
export const MAX_FAILED_PER_IP = 20;
/**
 * Ошибок по одному логину со всех IP. Порог высокий намеренно: иначе посторонний
 * мог бы заблокировать вход в чужой (например, демо-) аккаунт, просто вводя неверный пароль.
 */
export const MAX_FAILED_PER_LOGIN = 100;

/** Защита от подбора пароля. Проверяет три счётчика неудачных попыток за 15 минут. */
export async function isLoginRateLimited(login: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const failed = { success: false, createdAt: { gte: since } };
  const [byPair, byIp, byLogin] = await Promise.all([
    db.loginAttempt.count({ where: { ...failed, login, ip } }),
    db.loginAttempt.count({ where: { ...failed, ip } }),
    db.loginAttempt.count({ where: { ...failed, login } }),
  ]);
  return byPair >= MAX_FAILED_ATTEMPTS || byIp >= MAX_FAILED_PER_IP || byLogin >= MAX_FAILED_PER_LOGIN;
}

/**
 * Попытка записывается как неудачная ДО проверки пароля — так параллельные запросы
 * сразу видят друг друга в счётчике. При успехе запись помечается удачной.
 */
export async function startLoginAttempt(login: string, ip: string): Promise<string> {
  const attempt = await db.loginAttempt.create({ data: { login, ip, success: false }, select: { id: true } });
  return attempt.id;
}

export async function markLoginAttemptSuccessful(attemptId: string): Promise<void> {
  await db.loginAttempt.update({ where: { id: attemptId }, data: { success: true } });
}

/** Для тестов и совместимости: записать попытку с известным результатом. */
export async function recordLoginAttempt(login: string, ip: string, success: boolean) {
  await db.loginAttempt.create({ data: { login, ip, success } });
}
