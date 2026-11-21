import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isDemoMode } from "@/lib/config";
import type { UserContext } from "@/lib/auth/guards";
import { ABOUT_MAX_LENGTH } from "@/lib/validation/profile";

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

// ─── «О себе» ───────────────────────────────────────────────────────

/** Сколько раз в час можно сохранить «О себе»: обычный аккаунт… */
export const MAX_ABOUT_EDITS_PER_HOUR = 20;
/** …и тестовый аккаунт (isDemo) или любой аккаунт на демо-стенде (DEMO_MODE=1). */
export const MAX_ABOUT_EDITS_PER_HOUR_DEMO = 5;

export type MyAbout = {
  about: string | null;
  updatedAt: Date | null;
  /** Аккаунт общий для посетителей (тестовый аккаунт или демо-стенд): текст увидят другие, лимит строже. null — обычный */
  shared: PasswordChangeLock | null;
  /** Лимит сохранений в час для этого аккаунта */
  limitPerHour: number;
};

function aboutLimit(isDemo: boolean): number {
  return isDemo || isDemoMode() ? MAX_ABOUT_EDITS_PER_HOUR_DEMO : MAX_ABOUT_EDITS_PER_HOUR;
}

/** «О себе» текущего пользователя (любая роль). userId — только из контекста сессии. */
export async function getMyAbout(ctx: UserContext): Promise<MyAbout> {
  const u = await db.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: { about: true, aboutUpdatedAt: true, isDemo: true },
  });
  const shared = isDemoMode() ? "demo-mode" : u.isDemo ? "demo-account" : null;
  return { about: u.about, updatedAt: u.aboutUpdatedAt, shared, limitPerHour: aboutLimit(u.isDemo) };
}

export type UpdateAboutResult = { ok: true; about: string | null } | { ok: false; reason: "too-long" | "too-many-recent" };

/**
 * Сохраняет «О себе» ТОЛЬКО текущему пользователю: where — ctx.userId из сессии, id из формы не принимается.
 * Текст уже проверен схемой aboutSchema (lib/validation/profile.ts); пустая строка — очистить (null).
 * Частота ограничена журналом AboutEdit; блокировка строки пользователя (FOR UPDATE) не даёт
 * параллельным запросам одного человека обойти лимит.
 */
export async function updateMyAbout(ctx: UserContext, text: string): Promise<UpdateAboutResult> {
  // Вторая линия защиты на случай вызова в обход схемы
  if (text.length > ABOUT_MAX_LENGTH) return { ok: false, reason: "too-long" };
  const about = text.length > 0 ? text : null;

  return db.$transaction(async (tx) => {
    const [u] = await tx.$queryRaw<{ isDemo: boolean }[]>`SELECT "isDemo" FROM "User" WHERE "id" = ${ctx.userId} FOR UPDATE`;
    if (!u) throw new Error("Пользователь не найден");
    const lastHour = await tx.aboutEdit.count({
      where: { userId: ctx.userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (lastHour >= aboutLimit(u.isDemo)) return { ok: false, reason: "too-many-recent" } as const;

    await tx.aboutEdit.create({ data: { userId: ctx.userId } });
    const saved = await tx.user.update({
      where: { id: ctx.userId },
      data: { about, aboutUpdatedAt: new Date() },
      select: { about: true },
    });
    return { ok: true, about: saved.about } as const;
  });
}
