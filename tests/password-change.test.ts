/**
 * Смена пароля тестовых аккаунтов запрещена на сервере — и при DEMO_MODE=1,
 * и без него (по флагу User.isDemo в базе). Проверяется прямой вызов серверного
 * действия changePasswordAction, как если бы форму прислали в обход интерфейса.
 * Нужна база после npm run db:setup.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Сессию и заголовки запроса подменяем: в тестах нет запроса Next.js.
const session = vi.hoisted(() => ({ current: null as null | { sessionId: string; user: { id: string; login: string; role: "STUDENT" } } }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: async () => session.current,
  createSession: async () => {},
  destroyCurrentSession: async () => {},
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

import { changePasswordAction } from "@/lib/auth/actions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { PASSWORD_CHANGE_LOCK_MESSAGE, changeMyPassword, getPasswordChangeLock } from "@/lib/data/account";

const OLD = "Old-Password-123";
const NEW = "New-Password-456";
const originalDemoMode = process.env.DEMO_MODE;
const restore: { id: string; passwordHash: string }[] = [];

type TestUser = { id: string; login: string };
let demoUser: TestUser;
let regularUser: TestUser;

/** Ставит пользователю известный пароль; исходный хеш вернём после тестов. */
async function withKnownPassword(where: { isDemo: boolean }): Promise<TestUser> {
  const u = await db.user.findFirstOrThrow({
    where: { role: "STUDENT", ...where },
    orderBy: { login: "asc" },
    select: { id: true, login: true, passwordHash: true },
  });
  restore.push({ id: u.id, passwordHash: u.passwordHash });
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(OLD) } });
  return { id: u.id, login: u.login };
}

function form(currentPassword: string, newPassword: string) {
  const fd = new FormData();
  fd.set("currentPassword", currentPassword);
  fd.set("newPassword", newPassword);
  fd.set("confirmPassword", newPassword);
  return fd;
}

function actAs(u: TestUser) {
  session.current = { sessionId: "test-session", user: { id: u.id, login: u.login, role: "STUDENT" } };
}

async function passwordIs(u: TestUser, password: string) {
  const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: u.id }, select: { passwordHash: true } });
  return verifyPassword(passwordHash, password);
}

beforeAll(async () => {
  demoUser = await withKnownPassword({ isDemo: true });
  regularUser = await withKnownPassword({ isDemo: false });
});

afterEach(() => {
  process.env.DEMO_MODE = originalDemoMode;
});

afterAll(async () => {
  for (const r of restore) await db.user.update({ where: { id: r.id }, data: { passwordHash: r.passwordHash } });
  await db.loginAttempt.deleteMany({ where: { login: { in: [demoUser.login, regularUser.login] }, ip: "direct" } });
  await db.$disconnect();
});

describe("Смена пароля тестовых аккаунтов", () => {
  it("без DEMO_MODE: прямой вызов действия для тестового аккаунта (isDemo) отклоняется, пароль прежний", async () => {
    process.env.DEMO_MODE = "0";
    actAs(demoUser);
    expect(await getPasswordChangeLock(demoUser.id)).toBe("demo-account");
    const res = await changePasswordAction(undefined, form(OLD, NEW));
    expect(res).toEqual({ error: PASSWORD_CHANGE_LOCK_MESSAGE["demo-account"] });
    expect(await passwordIs(demoUser, OLD)).toBe(true);
  });

  it("без DEMO_MODE: слой данных тоже не меняет пароль тестового аккаунта", async () => {
    process.env.DEMO_MODE = "0";
    expect(await changeMyPassword(demoUser.id, "test-session", OLD, NEW)).toBe("demo-account");
    expect(await passwordIs(demoUser, OLD)).toBe(true);
  });

  it("DEMO_MODE=1: смена пароля отклоняется у любого аккаунта", async () => {
    process.env.DEMO_MODE = "1";
    actAs(regularUser);
    expect(await getPasswordChangeLock(regularUser.id)).toBe("demo-mode");
    const res = await changePasswordAction(undefined, form(OLD, NEW));
    expect(res).toEqual({ error: PASSWORD_CHANGE_LOCK_MESSAGE["demo-mode"] });
    expect(await passwordIs(regularUser, OLD)).toBe(true);
  });

  it("без DEMO_MODE обычный студент меняет пароль", async () => {
    process.env.DEMO_MODE = "0";
    actAs(regularUser);
    expect(await getPasswordChangeLock(regularUser.id)).toBeNull();
    const res = await changePasswordAction(undefined, form(OLD, NEW));
    expect(res?.success).toBeTruthy();
    expect(await passwordIs(regularUser, NEW)).toBe(true);
  });
});
