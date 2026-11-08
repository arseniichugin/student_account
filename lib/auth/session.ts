import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Role } from "@/lib/generated/prisma/client";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

/** В базе хранится только хеш токена: утечка базы не даёт войти под чужой сессией. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieIsSecure() {
  // В продакшене cookie передаётся только по HTTPS.
  // COOKIE_SECURE=false — только для локальной проверки продакшен-сборки по http://localhost.
  return process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // недоступна JavaScript в браузере
    secure: cookieIsSecure(),
    sameSite: "lax", // защита от CSRF
    path: "/",
    expires: expiresAt,
  });
}

export type CurrentSession = {
  sessionId: string;
  user: { id: string; login: string; role: Role };
};

/**
 * Текущая сессия по cookie. Результат кешируется на время одного запроса
 * (React `cache`), поэтому база не опрашивается повторно.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, user: { select: { id: true, login: true, role: true } } },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return { sessionId: session.id, user: session.user };
});

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}
