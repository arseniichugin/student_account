/**
 * Разбор ошибок для лога и формы (lib/actions/errors.ts) и проверка состояния базы (lib/health.ts).
 * Вторая часть — на настоящей базе после npm run db:setup.
 */
import { afterAll, describe, expect, it } from "vitest";
import { errorSummary, serverErrorMessage } from "@/lib/actions/errors";
import { db } from "@/lib/db";
import { checkHealth } from "@/lib/health";

afterAll(() => db.$disconnect());

const prismaMissingTable = Object.assign(
  new Error(
    "\nInvalid `db.loginAttempt.count()` invocation in\n/app/x.js:278:134\n\n  275 ip\n→ 278 db.loginAttempt.count(\nThe table `public.LoginAttempt` does not exist in the current database.",
  ),
  { name: "PrismaClientKnownRequestError", code: "P2021" },
);

describe("Ошибки серверных действий", () => {
  it("в лог — суть ошибки Prisma, а не первая строка", () => {
    const s = errorSummary(prismaMissingTable);
    expect(s).toContain("P2021");
    expect(s).toContain("does not exist");
    expect(s).not.toContain("invocation");
  });

  it("значения в кавычках (аргументы запроса, например логин) в лог не попадают", () => {
    const e = Object.assign(new Error('Invalid value\nwhere: { login: "secret.user does not exist" }'), { code: "P2009" });
    expect(errorSummary(e)).not.toContain("secret.user");
  });

  it("пользователю — «база не обновлена» для отсутствующих таблиц и общий текст для прочего", () => {
    expect(serverErrorMessage(prismaMissingTable)).toMatch(/база данных не обновлена/);
    expect(serverErrorMessage(new Error("boom"))).toMatch(/ошибки на сервере/);
  });
});

describe("Состояние базы", () => {
  it("на подготовленной базе: доступна, все миграции применены", async () => {
    const h = await checkHealth();
    expect(h.database).toBe("ok");
    expect(h.pendingMigrations).toEqual([]);
  });
});
