/**
 * Повторный импорт основного набора data/university в базу из DATABASE_URL (.env):
 * он идемпотентен, не меняет пароли и не теряет заявки и оценки.
 * Нужна база после npm run db:setup. Логины и пароли пишутся во временный файл,
 * а не в credentials.csv в корне репозитория.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { ROLE_STUDENT, credentialsCsv } from "@/lib/university-data/credentials";
import { parseCsv } from "@/lib/university-data/csv";
import { DEFAULT_DEMO_PASSWORD, importUniversityData } from "@/lib/university-data/import";
import { loadUniversityData } from "@/lib/university-data/load";

const tmp = mkdtempSync(path.join(tmpdir(), "import-again-"));

afterAll(async () => {
  rmSync(tmp, { recursive: true, force: true });
  await db.$disconnect();
});

async function snapshot() {
  const [users, students, requests, grades, deadlines, groups, teachers, rooms, lessons, lessonGroups, memberships] = await Promise.all([
    db.user.findMany({ select: { id: true, login: true, passwordHash: true, isDemo: true }, orderBy: { login: "asc" } }),
    db.student.findMany({ select: { id: true, externalId: true, academicGroupId: true }, orderBy: { externalId: "asc" } }),
    db.request.findMany({ select: { id: true, studentId: true, status: true }, orderBy: { id: "asc" } }),
    db.grade.count(),
    db.deadline.findMany({ select: { id: true, groupId: true }, orderBy: { id: "asc" } }),
    db.group.findMany({ select: { id: true, name: true, kind: true, parentId: true }, orderBy: { name: "asc" } }),
    db.teacher.findMany({ select: { id: true, oid: true }, orderBy: { oid: "asc" } }),
    db.room.count(),
    db.lesson.count(),
    db.lessonGroup.count(),
    db.studentGroup.count(),
  ]);
  return { users, students, requests, grades, deadlines, groups, teachers, rooms, lessons, lessonGroups, memberships };
}

describe("Повторный импорт", () => {
  it("идемпотентен: те же студенты и группы, заявки и оценки на месте, пароли не меняются", async () => {
    const result = loadUniversityData(path.resolve(process.env.UNIVERSITY_DATA_DIR || "data/university"));
    if (!result.ok) throw new Error("основной набор данных не проходит проверку");

    const before = await snapshot();
    expect(before.requests.length).toBeGreaterThan(0);
    const credentialsPath = path.join(tmp, "credentials.csv");

    const summary = await importUniversityData(db, result.data, {
      demoPassword: process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD,
      credentialsPath,
    });
    expect(summary.createdAccounts).toBe(0);
    expect(summary.removedStudents).toBe(0);

    const after = await snapshot();
    // Хеши тестовых аккаунтов пересчитываются (новая соль), остальные — те же самые
    const strip = (s: typeof before) => ({
      ...s,
      users: s.users.map((u) => ({ ...u, passwordHash: u.isDemo ? "demo" : u.passwordHash })),
    });
    expect(strip(after)).toEqual(strip(before));
    expect(after.lessons).toBe(result.data.lessons.length);
    expect(after.lessonGroups).toBe(result.data.scheduleRows);

    // Тестовым аккаунтам и деканатам импорт ставит DEMO_PASSWORD
    const demo = after.users.filter((u) => u.isDemo);
    expect(demo.length).toBe(3 + result.data.faculties.length);
    for (const u of demo) expect(await verifyPassword(u.passwordHash, process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD)).toBe(true);

    // Новых аккаунтов нет — в файле только тестовые студенты и деканаты, UTF-8 с BOM и «;»
    const text = readFileSync(credentialsPath, "utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const table = parseCsv(text);
    expect(table.headers).toEqual(["Логин", "ФИО", "Email", "Роль", "Пароль"]);
    expect(table.records.map((r) => r.values[0]).sort()).toEqual(demo.map((u) => u.login).sort());
  }, 180_000);

  it("логины, почта и зачётки могут «переехать» между студентами — пароли остаются у аккаунтов", async () => {
    const result = loadUniversityData(path.resolve(process.env.UNIVERSITY_DATA_DIR || "data/university"));
    if (!result.ok) throw new Error("основной набор данных не проходит проверку");
    const options = { demoPassword: process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD, credentialsPath: path.join(tmp, "swap.csv") };
    // Два обычных (не тестовых) студента меняются почтой и зачёткой
    const demoLogins = new Set((await db.user.findMany({ where: { isDemo: true }, select: { login: true } })).map((u) => u.login));
    const [a, b] = result.data.students.filter((s) => !demoLogins.has(s.login)).slice(10, 12);
    const swapped = {
      ...result.data,
      students: result.data.students.map((s) =>
        s === a ? { ...s, email: b!.email, login: b!.login, recordBookNo: b!.recordBookNo }
        : s === b ? { ...s, email: a!.email, login: a!.login, recordBookNo: a!.recordBookNo }
        : s,
      ),
    };
    const userOf = (externalId: string) =>
      db.user.findFirstOrThrow({ where: { student: { externalId } }, select: { id: true, login: true, passwordHash: true } });
    const beforeA = await userOf(a!.externalId);

    try {
      await importUniversityData(db, swapped, options);
      const afterA = await userOf(a!.externalId);
      expect(afterA.login).toBe(b!.login);
      expect(afterA.id).toBe(beforeA.id);
      expect(afterA.passwordHash).toBe(beforeA.passwordHash);
    } finally {
      await importUniversityData(db, result.data, options);
    }
    expect(await userOf(a!.externalId)).toEqual(beforeA);
  }, 180_000);

  it("бывший тестовый студент получает новый пароль, сменившееся ФИО закрывает сессии, пароли из .tmp не теряются", async () => {
    const result = loadUniversityData(path.resolve(process.env.UNIVERSITY_DATA_DIR || "data/university"));
    if (!result.ok) throw new Error("основной набор данных не проходит проверку");
    const demoPassword = process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
    const credentialsPath = path.join(tmp, "former.csv");

    const testLogins = (await db.user.findMany({ where: { isDemo: true, role: "STUDENT" }, select: { login: true }, orderBy: { login: "asc" } })).map((u) => u.login);
    const [dropped, ...keptTest] = testLogins;
    const regular = result.data.students.filter((s) => !testLogins.includes(s.login));
    const substitute = regular[20]!; // становится тестовым вместо dropped
    const renamed = regular[21]!; // тот же «ID студента», но другая фамилия
    const recovered = regular[22]!; // его пароль есть только в credentials.csv.tmp прошлого импорта
    const userBy = (login: string) => db.user.findUniqueOrThrow({ where: { login }, select: { id: true, passwordHash: true, isDemo: true } });
    const [droppedUser, substituteUser, renamedUser, recoveredUser] = await Promise.all([dropped!, substitute.login, renamed.login, recovered.login].map(userBy));

    // Сессии, которые должны закрыться
    const session = (userId: string) => db.session.create({ data: { userId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    const [droppedSession, renamedSession] = await Promise.all([session(droppedUser!.id), session(renamedUser!.id)]);

    // Прошлый импорт «оборвался» после фиксации транзакции: новый пароль действует, но лежит только в .tmp
    const KNOWN = "Recovered-Pass-1";
    await db.user.update({ where: { id: recoveredUser!.id }, data: { passwordHash: await hashPassword(KNOWN) } });
    const row = (login: string, password: string) => ({ login, fullName: "Тест", email: `${login}@example.org`, role: ROLE_STUDENT, password });
    writeFileSync(credentialsPath, credentialsCsv([row(recovered.login, "old-password-1")]));
    writeFileSync(`${credentialsPath}.tmp`, credentialsCsv([row(recovered.login, KNOWN), row(renamed.login, "not-in-db-123")]));

    try {
      const changed = {
        ...result.data,
        students: result.data.students.map((s) => (s === renamed ? { ...s, lastName: `${s.lastName}-Новая` } : s)),
      };
      const summary = await importUniversityData(db, changed, { demoPassword, credentialsPath, testLogins: [...keptTest, substitute.login] });

      // Бывший тестовый: без пометки, демо-пароль не подходит, новый пароль — в файле и подходит к базе
      const after = await userBy(dropped!);
      expect(after.isDemo).toBe(false);
      expect(await verifyPassword(after.passwordHash, demoPassword)).toBe(false);
      expect(summary.resetTestStudents).toBe(1);
      const creds = new Map(parseCsv(readFileSync(credentialsPath, "utf8")).records.map((r) => [r.values[0], r.values]));
      const droppedRow = creds.get(dropped!)!;
      expect(droppedRow[3]).toBe(ROLE_STUDENT);
      expect(await verifyPassword(after.passwordHash, droppedRow[4]!)).toBe(true);
      expect(await db.session.findUnique({ where: { id: droppedSession.id } })).toBeNull();

      // Тот же «ID студента», другое ФИО: сессии закрыты, пароль прежний, предупреждение в отчёте
      expect(await db.session.findUnique({ where: { id: renamedSession.id } })).toBeNull();
      expect((await userBy(renamed.login)).passwordHash).toBe(renamedUser!.passwordHash);
      expect(summary.warnings.some((w) => w.includes(`«${renamed.externalId}»`) && w.includes("ФИО"))).toBe(true);

      // .tmp объединён с основным файлом: действующий пароль перенесён, недействительный отброшен
      expect(existsSync(`${credentialsPath}.tmp`)).toBe(false);
      expect(creds.get(recovered.login)?.[4]).toBe(KNOWN);
      expect(creds.has(renamed.login)).toBe(false);
      expect(summary.warnings.some((w) => w.includes("перенесено в основной файл строк 1, отброшено недействительных 1"))).toBe(true);
    } finally {
      await importUniversityData(db, result.data, { demoPassword, credentialsPath });
      // Пароли обычных студентов, которых тест трогал, — как были
      for (const u of [substituteUser!, recoveredUser!]) await db.user.update({ where: { id: u.id }, data: { passwordHash: u.passwordHash } });
    }
    expect((await userBy(dropped!)).isDemo).toBe(true);
    expect((await userBy(substitute.login)).isDemo).toBe(false);
  }, 180_000);
});
