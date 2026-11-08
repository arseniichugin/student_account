import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * Смена пароля текущего пользователя. userId — только из сессии.
 * После смены все остальные сессии пользователя закрываются.
 */
export async function changeMyPassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<"ok" | "wrong-password"> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) return "wrong-password";

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } }),
    db.session.deleteMany({ where: { userId, id: { not: currentSessionId } } }),
  ]);
  return "ok";
}
