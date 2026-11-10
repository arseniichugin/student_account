import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isDemoMode } from "@/lib/config";

/** Почему смена пароля недоступна: демо-режим стенда или тестовый аккаунт. */
export type PasswordChangeLock = "demo-mode" | "demo-account";

/** Объяснения — одни и те же для профиля (вместо формы) и для ответа серверного действия. */
export const PASSWORD_CHANGE_LOCK_MESSAGE: Record<PasswordChangeLock, string> = {
  "demo-mode": "В демо-версии смена пароля отключена: тестовыми аккаунтами пользуются все посетители, в том числе жюри.",
  "demo-account": "Смена пароля отключена: это тестовый аккаунт, им пользуются все посетители, в том числе жюри.",
};

/**
 * Смена пароля запрещена в демо-режиме стенда (DEMO_MODE=1) и у тестовых аккаунтов
 * (флаг User.isDemo в базе) — даже если DEMO_MODE на сервере забыли включить.
 * Флаг читается из базы на сервере, а не из формы. userId — только из сессии.
 * null — менять можно.
 */
export async function getPasswordChangeLock(userId: string): Promise<PasswordChangeLock | null> {
  if (isDemoMode()) return "demo-mode";
  const user = await db.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
  return !user || user.isDemo ? "demo-account" : null;
}

/**
 * Смена пароля текущего пользователя. userId — только из сессии.
 * После смены все остальные сессии пользователя закрываются.
 * Тестовые аккаунты (isDemo) не меняются ни при каком DEMO_MODE — вторая линия защиты
 * на случай, если вызывающий код забудет проверить getPasswordChangeLock.
 */
export async function changeMyPassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<"ok" | "wrong-password" | PasswordChangeLock> {
  if (isDemoMode()) return "demo-mode";
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, isDemo: true } });
  if (user.isDemo) return "demo-account";
  if (!(await verifyPassword(user.passwordHash, currentPassword))) return "wrong-password";

  await db.$transaction([
    // isDemo: false в условии — если аккаунт стал тестовым за время проверки, обновление не пройдёт
    db.user.update({ where: { id: userId, isDemo: false }, data: { passwordHash: await hashPassword(newPassword) } }),
    db.session.deleteMany({ where: { userId, id: { not: currentSessionId } } }),
  ]);
  return "ok";
}
