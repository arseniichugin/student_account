/**
 * Повторный импорт основного набора data/university в базу из DATABASE_URL (.env):
 * он идемпотентен, не меняет пароли и не теряет заявки и оценки.
 * Нужна база после npm run db:setup. Логины и пароли пишутся во временный файл,
 * а не в credentials.csv в корне репозитория.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
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
    const result = loadUniversityData(path.join(process.cwd(), "data/university"));
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
});
