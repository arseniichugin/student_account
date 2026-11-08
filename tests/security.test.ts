/**
 * Тесты безопасности. Проверяют требования конкурса:
 *  — студент видит только свои данные (нельзя открыть чужое, подставив id);
 *  — сотрудник работает только с заявками своего факультета;
 *  — пароли хранятся только в виде хеша;
 *  — подбор пароля ограничен.
 *
 * Нужна заполненная база: npm run db:seed
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { MAX_FAILED_ATTEMPTS, isLoginRateLimited, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { getMyStudentProfile } from "@/lib/data/profile";
import {
  createMyRequest,
  getMyRequest,
  listFacultyRequests,
  listMyRequests,
  updateFacultyRequestStatus,
} from "@/lib/data/requests";

// В приложении контексты создаются только из сессии (requireStudent / requireStaff).
// В тестах собираем их из базы напрямую — так проверяется сам слой данных.
async function studentCtx(login: string): Promise<StudentContext> {
  const user = await db.user.findUniqueOrThrow({ where: { login }, include: { student: true } });
  return { userId: user.id, studentId: user.student!.id } as StudentContext;
}
async function staffCtx(login: string): Promise<StaffContext> {
  const user = await db.user.findUniqueOrThrow({ where: { login }, include: { staff: true } });
  return { userId: user.id, staffId: user.staff!.id, facultyId: user.staff!.facultyId } as StaffContext;
}

let dima: StudentContext;
let anna: StudentContext;
let fitStaff: StaffContext;
let efStaff: StaffContext;
const createdRequestIds: string[] = [];

beforeAll(async () => {
  dima = await studentCtx("dima.sokolov");
  anna = await studentCtx("anna.belova");
  fitStaff = await staffCtx("dekanat.fit");
  efStaff = await staffCtx("dekanat.ef");
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { link: { in: createdRequestIds.map((id) => `/requests/${id}`) } } });
  await db.request.deleteMany({ where: { id: { in: createdRequestIds } } });
  await db.loginAttempt.deleteMany({ where: { login: { startsWith: "test-bruteforce-" } } });
  await db.$disconnect();
});

describe("Студент видит только свои данные", () => {
  it("список заявок содержит только заявки самого студента", async () => {
    const requests = await listMyRequests(dima);
    expect(requests.length).toBeGreaterThan(0);
    const owners = await db.request.findMany({
      where: { id: { in: requests.map((r) => r.id) } },
      select: { studentId: true },
    });
    expect(owners.every((o) => o.studentId === dima.studentId)).toBe(true);
  });

  it("чужую заявку нельзя открыть, подставив её id", async () => {
    const annasRequest = await db.request.findFirstOrThrow({ where: { studentId: anna.studentId } });

    // Владелец видит свою заявку…
    expect(await getMyRequest(anna, annasRequest.id)).not.toBeNull();
    // …а другой студент получает «не найдено», хотя заявка существует.
    expect(await getMyRequest(dima, annasRequest.id)).toBeNull();
  });

  it("профиль возвращается только для владельца сессии", async () => {
    const profile = await getMyStudentProfile(dima);
    expect(profile.user.login).toBe("dima.sokolov");
  });

  it("заявка создаётся от имени владельца сессии", async () => {
    const type = await db.requestType.findFirstOrThrow();
    const created = await createMyRequest(dima, {
      typeId: type.id,
      destination: "Тест",
      copies: 1,
      comment: "",
    });
    expect(created).not.toBeNull();
    createdRequestIds.push(created!.id);

    const row = await db.request.findUniqueOrThrow({ where: { id: created!.id } });
    expect(row.studentId).toBe(dima.studentId);
    expect(await getMyRequest(anna, created!.id)).toBeNull();
  });
});

describe("Сотрудник видит только заявки своего факультета", () => {
  it("в списке деканата ФИТ нет заявок студентов ЭФ", async () => {
    const fitRequests = await listFacultyRequests(fitStaff);
    const annaRequestIds = (await db.request.findMany({ where: { studentId: anna.studentId } })).map((r) => r.id);
    expect(fitRequests.some((r) => annaRequestIds.includes(r.id))).toBe(false);
  });

  it("деканат ФИТ не может изменить статус заявки студента ЭФ", async () => {
    const annasRequest = await db.request.findFirstOrThrow({ where: { studentId: anna.studentId } });
    const result = await updateFacultyRequestStatus(fitStaff, {
      requestId: annasRequest.id,
      status: "REJECTED",
      comment: "попытка изменить чужую заявку",
    });
    expect(result).toBeNull();

    const after = await db.request.findUniqueOrThrow({ where: { id: annasRequest.id } });
    expect(after.status).toBe(annasRequest.status);
  });

  it("смена статуса своей заявки уведомляет студента", async () => {
    const type = await db.requestType.findFirstOrThrow();
    const created = await createMyRequest(anna, { typeId: type.id, destination: "Тест", copies: 1, comment: "" });
    createdRequestIds.push(created!.id);

    const updated = await updateFacultyRequestStatus(efStaff, {
      requestId: created!.id,
      status: "READY",
      comment: "Готово",
    });
    expect(updated?.status).toBe("READY");

    const notification = await db.notification.findFirst({
      where: { userId: anna.userId, link: `/requests/${created!.id}` },
    });
    expect(notification).not.toBeNull();
  });
});

describe("Пароли", () => {
  it("в базе хранятся только хеши argon2id", async () => {
    const users = await db.user.findMany({ select: { passwordHash: true } });
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(u.passwordHash).not.toContain("Gorizont2026");
    }
  });

  it("хеш проверяет правильный пароль и отвергает неправильный", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(h, "wrong password")).toBe(false);
  });

  it("одинаковые пароли дают разные хеши (соль)", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("Защита от подбора пароля", () => {
  it(`после ${MAX_FAILED_ATTEMPTS} неудачных попыток вход блокируется`, async () => {
    const login = `test-bruteforce-${Date.now()}`;
    const ip = "203.0.113.7";
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) await recordLoginAttempt(login, ip, false);
    expect(await isLoginRateLimited(login, ip)).toBe(false);

    await recordLoginAttempt(login, ip, false);
    expect(await isLoginRateLimited(login, ip)).toBe(true);
  });
});
