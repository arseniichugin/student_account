"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import { isLoginRateLimited, markLoginAttemptSuccessful, startLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, destroyCurrentSession, getCurrentSession } from "@/lib/auth/session";
import { PASSWORD_CHANGE_LOCK_MESSAGE, changeMyPassword, getPasswordChangeLock } from "@/lib/data/account";
import { changePasswordSchema, loginSchema } from "@/lib/validation/auth";

export type FormState = { error?: string; success?: string } | undefined;
export type LoginState = { error?: string; login?: string } | undefined;

async function clientIp(): Promise<string> {
  // Заголовкам с адресом клиента верим, только если перед приложением стоит НАШ прокси
  // (Caddy/nginx), который сам выставляет X-Real-IP и затирает присланный клиентом.
  // Иначе любой мог бы подставить случайный адрес и обойти лимит попыток по IP.
  if (process.env.TRUST_PROXY !== "1") return "direct";
  const h = await headers();
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
  });
  // Логин возвращаем в форму, чтобы после ошибки не вводить его заново.
  const typedLogin = String(formData.get("login") ?? "").slice(0, 64);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы", login: typedLogin };

  const { login, password } = parsed.data;
  const ip = await clientIp();

  if (await isLoginRateLimited(login, ip)) {
    return { error: "Слишком много попыток входа. Попробуйте через 15 минут.", login: typedLogin };
  }

  // Попытка учитывается ещё до проверки пароля — параллельные запросы не обойдут лимит.
  const attemptId = await startLoginAttempt(login, ip);

  const user = await db.user.findUnique({ where: { login }, select: { id: true, passwordHash: true } });
  // Даже если логина нет, проверяем «пустой» хеш — чтобы время ответа было одинаковым.
  const ok = user
    ? await verifyPassword(user.passwordHash, password)
    : (await verifyPassword(await getDummyHash(), password), false);

  // Одно сообщение на оба случая: не подсказываем, что именно неверно.
  if (!ok || !user) return { error: "Неверный логин или пароль", login: typedLogin };

  await markLoginAttemptSuccessful(attemptId);
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // Тестовые аккаунты общие для всех посетителей (жюри): смена пароля закрыла бы вход остальным.
  // Проверка на сервере — по DEMO_MODE и по флагу isDemo из базы; скрытая форма — не защита.
  const lock = await getPasswordChangeLock(session.user.id);
  if (lock) return { error: PASSWORD_CHANGE_LOCK_MESSAGE[lock] };

  // Подбор текущего пароля ограничен так же, как вход.
  const ip = await clientIp();
  if (await isLoginRateLimited(session.user.login, ip)) {
    return { error: "Слишком много попыток. Попробуйте через 15 минут." };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };

  const result = await changeMyPassword(
    session.user.id,
    session.sessionId,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
  if (result === "demo-mode" || result === "demo-account") return { error: PASSWORD_CHANGE_LOCK_MESSAGE[result] };
  if (result === "wrong-password") {
    await startLoginAttempt(session.user.login, ip); // неудачная попытка идёт в общий счётчик
    return { error: "Текущий пароль указан неверно" };
  }
  return { success: "Пароль изменён. На других устройствах нужно будет войти заново." };
}
