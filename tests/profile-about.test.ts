/**
 * Профиль любой роли: «О себе» (только своё, лимит, длина и обычный текст) и смена пароля
 * у студента, сотрудника деканата и преподавателя. Серверные действия вызываются напрямую,
 * как если бы форму прислали в обход интерфейса. Нужна база после npm run db:setup.
 * Всё, что тест меняет (тексты, хеши паролей, флаг isDemo), возвращается в afterAll.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type Role = "STUDENT" | "STAFF" | "TEACHER";
const session = vi.hoisted(() => ({
  current: null as null | { sessionId: string; user: { id: string; login: string; role: Role } },
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: async () => session.current,
  createSession: async () => {},
  destroyCurrentSession: async () => {},
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  unstable_rethrow: () => {},
}));

import type { UserContext } from "@/lib/auth/guards";
import { changePasswordAction } from "@/lib/auth/actions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import {
  MAX_ABOUT_EDITS_PER_HOUR,
  MAX_ABOUT_EDITS_PER_HOUR_DEMO,
  PASSWORD_CHANGE_LOCK_MESSAGE,
  getMyAbout,
  getPasswordChangeLock,
  updateMyAbout,
} from "@/lib/data/account";
import { getTeacherSchedule } from "@/lib/data/schedule";
import { saveAboutAction } from "@/lib/profile/actions";
import { ABOUT_MAX_LENGTH, aboutSchema } from "@/lib/validation/profile";

type TestUser = { id: string; login: string; role: Role };
type Saved = { id: string; passwordHash: string; about: string | null; aboutUpdatedAt: Date | null; isDemo: boolean };

const OLD = "Old-Password-123";
const NEW = "New-Password-456";
const started = new Date();
const originalDemoMode = process.env.DEMO_MODE;
const saved: Saved[] = [];

let student: TestUser; // обычный студент
let other: TestUser; // другой обычный студент — его «О себе» трогать нельзя
let teacher: TestUser; // обычный преподаватель
let staff: TestUser; // сотрудник деканата (все тестовые — на время теста делаем обычным)
let demoTeacher: TestUser; // тестовый преподаватель (isDemo)

async function remember(where: { role: Role; isDemo: boolean }, skip: string[] = []): Promise<TestUser> {
  const u = await db.user.findFirstOrThrow({
    where: { ...where, id: { notIn: skip } },
    orderBy: { login: "asc" },
    select: { id: true, login: true, role: true, passwordHash: true, about: true, aboutUpdatedAt: true, isDemo: true },
  });
  saved.push({ id: u.id, passwordHash: u.passwordHash, about: u.about, aboutUpdatedAt: u.aboutUpdatedAt, isDemo: u.isDemo });
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(OLD), about: null } });
  return { id: u.id, login: u.login, role: u.role };
}

function actAs(u: TestUser) {
  session.current = { sessionId: "test-session", user: { id: u.id, login: u.login, role: u.role } };
}

const userCtx = (u: TestUser) => ({ userId: u.id, role: u.role, facultyId: null }) as UserContext;

function aboutForm(text: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("about", text);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

function passwordForm(current: string, next: string) {
  const fd = new FormData();
  fd.set("currentPassword", current);
  fd.set("newPassword", next);
  fd.set("confirmPassword", next);
  return fd;
}

async function aboutOf(u: TestUser) {
  return (await db.user.findUniqueOrThrow({ where: { id: u.id }, select: { about: true } })).about;
}

async function passwordIs(u: TestUser, password: string) {
  const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: u.id }, select: { passwordHash: true } });
  return verifyPassword(passwordHash, password);
}

async function clearEdits(u: TestUser) {
  await db.aboutEdit.deleteMany({ where: { userId: u.id, createdAt: { gte: started } } });
}

beforeAll(async () => {
  delete process.env.DEMO_MODE;
  student = await remember({ role: "STUDENT", isDemo: false });
  other = await remember({ role: "STUDENT", isDemo: false }, [student.id]);
  teacher = await remember({ role: "TEACHER", isDemo: false });
  staff = await remember({ role: "STAFF", isDemo: true });
  await db.user.update({ where: { id: staff.id }, data: { isDemo: false } });
  demoTeacher = await remember({ role: "TEACHER", isDemo: true });
});

afterEach(async () => {
  delete process.env.DEMO_MODE; // тесты, которым нужен демо-режим, включают его сами
  for (const u of [student, other, teacher, staff, demoTeacher]) await clearEdits(u);
});

afterAll(async () => {
  if (originalDemoMode !== undefined) process.env.DEMO_MODE = originalDemoMode;
  for (const s of saved) {
    await db.user.update({
      where: { id: s.id },
      data: { passwordHash: s.passwordHash, about: s.about, aboutUpdatedAt: s.aboutUpdatedAt, isDemo: s.isDemo },
    });
  }
  await db.aboutEdit.deleteMany({ where: { userId: { in: saved.map((s) => s.id) }, createdAt: { gte: started } } });
  await db.loginAttempt.deleteMany({ where: { login: { in: [student.login, teacher.login, staff.login, demoTeacher.login] }, ip: "direct" } });
  await db.$disconnect();
});

describe("«О себе»: схема", () => {
  it("обрезает пробелы по краям и приводит переводы строк к \\n", () => {
    expect(aboutSchema.parse("  Привет\r\nмир\r\n  ")).toBe("Привет\nмир");
  });
  it("не больше 1000 символов", () => {
    expect(aboutSchema.safeParse("а".repeat(ABOUT_MAX_LENGTH)).success).toBe(true);
    expect(aboutSchema.safeParse("а".repeat(ABOUT_MAX_LENGTH + 1)).success).toBe(false);
  });
  it("отклоняет управляющие символы, HTML оставляет как обычный текст", () => {
    expect(aboutSchema.safeParse("до\u0000после").success).toBe(false);
    expect(aboutSchema.parse("<b>жирный</b>")).toBe("<b>жирный</b>");
  });
});

describe("«О себе»: только своё", () => {
  it("студент сохраняет свой текст с переводами строк; пустой текст — удалить", async () => {
    actAs(student);
    const res = await saveAboutAction(undefined, aboutForm("Люблю зельеварение.\nПишите в почту."));
    expect(res?.success).toBeTruthy();
    expect(await aboutOf(student)).toBe("Люблю зельеварение.\nПишите в почту.");
    expect((await getMyAbout(userCtx(student))).about).toBe("Люблю зельеварение.\nПишите в почту.");

    expect((await saveAboutAction(undefined, aboutForm("   ")))?.success).toBeTruthy();
    expect(await aboutOf(student)).toBeNull();
  });

  it("userId из формы игнорируется: чужой текст не меняется, меняется только свой", async () => {
    await db.user.update({ where: { id: other.id }, data: { about: "Текст другого студента" } });
    actAs(student);
    const res = await saveAboutAction(undefined, aboutForm("Подмена", { userId: other.id, id: other.id }));
    expect(res?.success).toBeTruthy();
    expect(await aboutOf(other)).toBe("Текст другого студента");
    expect(await aboutOf(student)).toBe("Подмена");
  });

  it("без сессии — на страницу входа, ничего не сохраняется", async () => {
    session.current = null;
    await expect(saveAboutAction(undefined, aboutForm("Аноним"))).rejects.toThrow("redirect /login");
  });

  it("сотрудник деканата и преподаватель тоже сохраняют своё", async () => {
    for (const u of [staff, teacher]) {
      actAs(u);
      expect((await saveAboutAction(undefined, aboutForm(`Я — ${u.role}`)))?.success).toBeTruthy();
      expect(await aboutOf(u)).toBe(`Я — ${u.role}`);
    }
  });

  it("слишком длинный текст отклоняется и действием, и слоем данных", async () => {
    actAs(student);
    await db.user.update({ where: { id: student.id }, data: { about: "было" } });
    const res = await saveAboutAction(undefined, aboutForm("а".repeat(ABOUT_MAX_LENGTH + 1)));
    expect(res?.error).toMatch(/1000/);
    expect(await updateMyAbout(userCtx(student), "а".repeat(ABOUT_MAX_LENGTH + 1))).toEqual({ ok: false, reason: "too-long" });
    expect(await aboutOf(student)).toBe("было");
  });

  it("«О себе» преподавателя видно в его расписании", async () => {
    await db.user.update({ where: { id: teacher.id }, data: { about: "Консультации по средам" } });
    const t = await db.teacher.findFirstOrThrow({ where: { userId: teacher.id }, select: { id: true } });
    const res = await getTeacherSchedule(userCtx(student), t.id, "2026-11-16", "2026-11-22");
    expect(res?.about).toBe("Консультации по средам");
  });
});

describe("«О себе»: ограничение частоты", () => {
  it(`обычный аккаунт — до ${MAX_ABOUT_EDITS_PER_HOUR} сохранений в час`, async () => {
    await db.aboutEdit.createMany({ data: Array.from({ length: MAX_ABOUT_EDITS_PER_HOUR - 1 }, () => ({ userId: student.id })) });
    expect((await updateMyAbout(userCtx(student), "последнее разрешённое")).ok).toBe(true);
    expect(await updateMyAbout(userCtx(student), "лишнее")).toEqual({ ok: false, reason: "too-many-recent" });
    actAs(student);
    expect((await saveAboutAction(undefined, aboutForm("лишнее")))?.error).toMatch(/Слишком часто/);
    expect(await aboutOf(student)).toBe("последнее разрешённое");
  });

  it(`тестовый аккаунт — до ${MAX_ABOUT_EDITS_PER_HOUR_DEMO} в час`, async () => {
    expect(await getMyAbout(userCtx(demoTeacher))).toMatchObject({ limitPerHour: MAX_ABOUT_EDITS_PER_HOUR_DEMO, shared: "demo-account" });
    expect((await getMyAbout(userCtx(student))).shared).toBeNull();
    for (let i = 0; i < MAX_ABOUT_EDITS_PER_HOUR_DEMO; i++) {
      expect((await updateMyAbout(userCtx(demoTeacher), `текст ${i}`)).ok).toBe(true);
    }
    expect(await updateMyAbout(userCtx(demoTeacher), "лишнее")).toEqual({ ok: false, reason: "too-many-recent" });
  });

  it("DEMO_MODE=1 — строгий лимит у любого аккаунта", async () => {
    process.env.DEMO_MODE = "1";
    const info = await getMyAbout(userCtx(student));
    expect(info.limitPerHour).toBe(MAX_ABOUT_EDITS_PER_HOUR_DEMO);
    expect(info.shared).toBe("demo-mode");
  });

  it("параллельные сохранения не обходят лимит", async () => {
    const results = await Promise.all(
      Array.from({ length: MAX_ABOUT_EDITS_PER_HOUR_DEMO + 3 }, (_, i) => updateMyAbout(userCtx(demoTeacher), `параллельно ${i}`)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_ABOUT_EDITS_PER_HOUR_DEMO);
  });
});

describe("Смена пароля в каждом кабинете", () => {
  it("тестовый аккаунт (преподаватель) — отклоняется, пароль прежний", async () => {
    actAs(demoTeacher);
    expect(await getPasswordChangeLock(demoTeacher.id)).toBe("demo-account");
    expect(await changePasswordAction(undefined, passwordForm(OLD, NEW))).toEqual({ error: PASSWORD_CHANGE_LOCK_MESSAGE["demo-account"] });
    expect(await passwordIs(demoTeacher, OLD)).toBe(true);
  });

  it("DEMO_MODE=1 — отклоняется у обычного сотрудника деканата", async () => {
    process.env.DEMO_MODE = "1";
    actAs(staff);
    expect(await changePasswordAction(undefined, passwordForm(OLD, NEW))).toEqual({ error: PASSWORD_CHANGE_LOCK_MESSAGE["demo-mode"] });
    expect(await passwordIs(staff, OLD)).toBe(true);
  });

  it("обычные студент, сотрудник деканата и преподаватель меняют пароль", async () => {
    for (const u of [student, staff, teacher]) {
      actAs(u);
      expect(await getPasswordChangeLock(u.id)).toBeNull();
      const res = await changePasswordAction(undefined, passwordForm(OLD, NEW));
      expect(res?.success, u.role).toBeTruthy();
      expect(await passwordIs(u, NEW)).toBe(true);
    }
  });

  it("неверный текущий пароль — ошибка, пароль не меняется", async () => {
    actAs(teacher);
    expect(await changePasswordAction(undefined, passwordForm("wrong-password-1", "Another-Pass-789"))).toEqual({
      error: "Текущий пароль указан неверно",
    });
    expect(await passwordIs(teacher, NEW)).toBe(true);
  });
});
