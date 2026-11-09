/**
 * Обработчик поиска по расписанию GET /api/schedule/search.
 * cookies() из next/headers подменяем: сессию создаём прямо в базе (хеш токена), как это делает вход.
 * Нужна база с загруженным набором данных (npm run db:setup).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let cookieToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sid" && cookieToken ? { name, value: cookieToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { GET } = await import("@/app/api/schedule/search/route");
const { db } = await import("@/lib/db");
const { hashToken } = await import("@/lib/auth/session");
const { SCHEDULE_SEARCH_LIMIT } = await import("@/lib/validation/schedule");

const sessionIds: string[] = [];
let studentToken = "";
let student: { lastName: string; firstName: string; login: string; ids: string[] };

async function createTestSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const s = await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  sessionIds.push(s.id);
  return token;
}

// null — запрос без cookie (undefined не годится: подставится значение по умолчанию)
function search(query: string, token: string | null = studentToken) {
  cookieToken = token ?? undefined;
  return GET(new Request(`http://localhost/api/schedule/search?${query}`));
}

beforeAll(async () => {
  const s = await db.student.findFirstOrThrow({
    where: { user: { isDemo: true } },
    orderBy: { externalId: "asc" },
    select: { id: true, userId: true, lastName: true, firstName: true, user: { select: { login: true } } },
  });
  student = { lastName: s.lastName, firstName: s.firstName, login: s.user.login, ids: [s.id, s.userId] };
  studentToken = await createTestSession(s.userId);
});

afterAll(async () => {
  await db.session.deleteMany({ where: { id: { in: sessionIds } } });
  await db.$disconnect();
});

describe("Поиск по расписанию: доступ", () => {
  it("без сессии — 401, а не редирект и не данные", async () => {
    const res = await search("q=1-", null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it("с поддельным или истёкшим токеном — 401", async () => {
    expect((await search("q=1-", "not-a-real-token")).status).toBe(401);

    const user = await db.user.findFirstOrThrow({ where: { isDemo: true }, select: { id: true } });
    const token = randomBytes(32).toString("base64url");
    const expired = await db.session.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });
    sessionIds.push(expired.id);
    expect((await search("q=1-", token)).status).toBe(401);
  });

  it("ответ не кешируется (private, no-store)", async () => {
    const res = await search("q=1-");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

describe("Поиск по расписанию: что возвращает", () => {
  it("находит группы и преподавателей, не больше лимита", async () => {
    const res = await search(`q=${encodeURIComponent("1-")}`);
    const { results } = (await res.json()) as { results: { type: string }[] };
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(SCHEDULE_SEARCH_LIMIT);
    expect(results.every((r) => r.type === "group")).toBe(true);
  });

  it("не возвращает студентов — ни по фамилии, ни по логину", async () => {
    for (const q of [student.lastName, `${student.lastName} ${student.firstName}`, student.login]) {
      const res = await search(`q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      const body = await res.text();
      for (const id of student.ids) expect(body).not.toContain(id);
      expect(body).not.toContain(student.login);
      const { results } = JSON.parse(body) as { results: { type: string; id: string }[] };
      expect(results.every((r) => r.type === "group" || r.type === "teacher")).toBe(true);
      // Каждый «преподаватель» — действительно из таблицы преподавателей
      const teacherIds = results.filter((r) => r.type === "teacher").map((r) => r.id);
      expect(await db.teacher.count({ where: { id: { in: teacherIds } } })).toBe(teacherIds.length);
    }
  });

  it("отдаёт только перечисленные поля (без почты преподавателя и служебных данных)", async () => {
    const teacher = await db.teacher.findFirstOrThrow({ where: { email: { not: null } }, select: { shortName: true, email: true } });
    const res = await search(`q=${encodeURIComponent(teacher.shortName.split(" ")[0]!)}`);
    const { results } = (await res.json()) as { results: Record<string, unknown>[] };
    const t = results.find((r) => r.type === "teacher")!;
    expect(Object.keys(t).sort()).toEqual(["fullName", "id", "rank", "shortName", "type"]);
    const g = (await (await search("q=1-")).json()).results[0] as Record<string, unknown>;
    expect(Object.keys(g).sort()).toEqual(["course", "faculty", "id", "kind", "name", "type"]);
  });

  it("фильтр по факультету: группы только этого факультета", async () => {
    const faculty = await db.faculty.findFirstOrThrow({ orderBy: { sortOrder: "desc" }, select: { id: true, name: true } });
    const res = await search(`q=${encodeURIComponent("-")}&faculty=${faculty.id}`);
    const { results } = (await res.json()) as { results: { type: string; faculty?: string }[] };
    const groups = results.filter((r) => r.type === "group");
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.faculty === faculty.name)).toBe(true);
  });

  it("пустой запрос — пустой список; слишком длинный — 400", async () => {
    expect(await (await search("q=")).json()).toEqual({ results: [] });
    expect(await (await search("q=%20%20")).json()).toEqual({ results: [] });
    expect((await search(`q=${"a".repeat(65)}`)).status).toBe(400);
    expect((await search(`q=a&faculty=${"f".repeat(65)}`)).status).toBe(400);
  });
});
