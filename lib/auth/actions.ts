"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import { isLoginRateLimited, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, destroyCurrentSession, getCurrentSession } from "@/lib/auth/session";
import { changeMyPassword } from "@/lib/data/account";
import { changePasswordSchema, loginSchema } from "@/lib/validation/auth";

export type FormState = { error?: string; success?: string } | undefined;
export type LoginState = { error?: string; login?: string } | undefined;

async function clientIp(): Promise<string> {
  const h = await headers();
  // На сервере за обратным прокси (nginx) реальный адрес приходит в X-Forwarded-For.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
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

  const user = await db.user.findUnique({ where: { login }, select: { id: true, passwordHash: true } });
  // Даже если логина нет, проверяем «пустой» хеш — чтобы время ответа было одинаковым.
  const ok = user
    ? await verifyPassword(user.passwordHash, password)
    : (await verifyPassword(await getDummyHash(), password), false);

  await recordLoginAttempt(login, ip, ok);

  // Одно сообщение на оба случая: не подсказываем, что именно неверно.
  if (!ok || !user) return { error: "Неверный логин или пароль", login: typedLogin };

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
  if (result === "wrong-password") return { error: "Текущий пароль указан неверно" };
  return { success: "Пароль изменён. На других устройствах нужно будет войти заново." };
}
