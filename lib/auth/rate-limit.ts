import "server-only";
import { db } from "@/lib/db";

export const MAX_FAILED_ATTEMPTS = 5;
export const WINDOW_MINUTES = 15;

/**
 * Защита от подбора пароля: не больше 5 неудачных попыток за 15 минут
 * для одного логина или одного IP-адреса.
 */
export async function isLoginRateLimited(login: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [byLogin, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { login, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  return byLogin >= MAX_FAILED_ATTEMPTS || byIp >= MAX_FAILED_ATTEMPTS * 4;
}

export async function recordLoginAttempt(login: string, ip: string, success: boolean) {
  await db.loginAttempt.create({ data: { login, ip, success } });
}
