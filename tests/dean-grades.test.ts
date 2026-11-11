/**
 * Успеваемость для деканата (lib/data/dean-grades.ts, /api/staff/students/search, страницы /staff/grades/*):
 * только свой факультет, роли, та же логика оценок, что у студента, агрегаты курса и поиск.
 * Сессию подменяем (как в password-change.test.ts). Нужна база после npm run db:setup; только чтение.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Role = "STUDENT" | "STAFF" | "TEACHER";
const session = vi.hoisted(() => ({ current: null as null | { sessionId: string; user: { id: string; login: string; role: Role } } }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: async () => session.current,
  createSession: async () => {},
  destroyCurrentSession: async () => {},
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));

import { GET as searchRoute } from "@/app/api/staff/students/search/route";
import { requireStaff, type StaffContext, type StudentContext } from "@/lib/auth/guards";
import {
  getCourseOverview,
  getFacultyCourses,
  getFacultyGroupGrades,
  getFacultyStudentGrades,
  isFacultyGroup,
  isFacultyStudent,
  searchFacultyStudents,
} from "@/lib/data/dean-grades";
import { getMyGrades } from "@/lib/data/grades";
import { db } from "@/lib/db";
import { cohortSummary, debtDisciplines, disciplineAverage, type StudentResult } from "@/lib/grades/course-stats";
import { averagePoints, scored, type ScoredGrade } from "@/lib/grades/scale";
import { hasFailing } from "@/lib/grades/stats";
import { recordBookFromParam } from "@/lib/validation/dean-grades";

type Login = { id: string; login: string; role: Role };
let sl: StaffContext;
let gr: StaffContext;
let staffUser: Login;
let studentUser: Login;
let teacherUser: Login;
let eva: { id: string; userId: string; recordBookNo: string; lastName: string; firstName: string; course: number; academicGroupId: string };

async function staffCtx(login: string): Promise<StaffContext> {
  const s = await db.staff.findFirstOrThrow({ where: { user: { login } }, select: { id: true, userId: true, facultyId: true } });
  return { userId: s.userId, staffId: s.id, facultyId: s.facultyId } as StaffContext;
}

const user = async (login: string): Promise<Login> =>
  db.user.findUniqueOrThrow({ where: { login }, select: { id: true, login: true, role: true } }) as Promise<Login>;

const as = (u: Login | null) => {
  session.current = u ? { sessionId: "test", user: u } : null;
};

beforeAll(async () => {
  [sl, gr] = await Promise.all([staffCtx("dekanat.sl"), staffCtx("dekanat.gr")]);
  [staffUser, studentUser, teacherUser] = await Promise.all([user("dekanat.sl"), user("eva.orlova25"), user("s.semenov")]);
  eva = await db.student.findFirstOrThrow({
    where: { user: { login: "eva.orlova25" } },
    select: { id: true, userId: true, recordBookNo: true, lastName: true, firstName: true, course: true, academicGroupId: true },
  });
  expect(eva.course).toBe(2);
});

afterAll(async () => {
  session.current = null;
  await db.$disconnect();
});

// ─── Агрегаты на маленьком наборе (без базы) ───────────────────────

const g = (points: number): ScoredGrade => scored(points);
const disc = (
  id: string,
  cps: (number | null)[],
  finalResult: StudentResult["disciplines"][number]["finalResult"] = null,
): StudentResult["disciplines"][number] => {
  const checkpoints = cps.map((p) => (p === null ? null : g(p))) as [ScoredGrade | null, ScoredGrade | null, ScoredGrade | null];
  const avg = averagePoints(cps);
  return { disciplineId: id, discipline: id.toUpperCase(), checkpoints, finalResult, average: avg === null ? null : g(avg) };
};
const student = (disciplines: StudentResult["disciplines"]): StudentResult => {
  const overall = averagePoints(disciplines.map((d) => d.average?.points));
  return { overall: overall === null ? null : g(overall), disciplines };
};

describe("Сводка курса: пересчёт вручную", () => {
  // Студент 1: a — 90, 80 (85); b — 50 (FX, долг) → итоговый (85 + 50) / 2 = 67,5 → D
  // Студент 2: a — 100, 94 (97); b — 40, 70 (55), но зачёт сдан → долга нет → (97 + 55) / 2 = 76 → C
  // Студент 3: a — 30 (F) → итоговый 30 → F, долг; b — нет оценок
  // Студент 4: оценок нет вообще
  const s1 = student([disc("a", [90, 80, null]), disc("b", [50, null, null])]);
  const s2 = student([disc("a", [100, 94, null]), disc("b", [40, 70, null], { kind: "CREDIT", passed: true })]);
  const s3 = student([disc("a", [30, null, null]), disc("b", [null, null, null])]);
  const s4 = student([disc("a", [null, null, null]), disc("b", [null, null, null])]);
  const all = [s1, s2, s3, s4];

  it("итоговые баллы студентов — среднее из средних", () => {
    expect([s1.overall, s2.overall, s3.overall, s4.overall]).toEqual([g(67.5), g(76), g(30), null]);
  });

  it("средний балл курса, распределение по буквам, долги, заполнение среза", () => {
    const s = cohortSummary(all, 2);
    expect(s.students).toBe(4);
    expect(s.graded).toBe(3);
    // (67,5 + 76 + 30) / 3 = 57,83… → 57,8 → FX
    expect(s.average).toEqual({ points: 57.8, letter: "FX" });
    const count = Object.fromEntries(s.distribution.map((d) => [d.letter ?? "none", d.count]));
    expect(count).toEqual({ A: 0, B: 0, C: 1, D: 1, E: 0, FX: 0, F: 1, none: 1 });
    // Долг у студента 1 (FX за срез) и 3 (F); у 2 FX закрыт зачётом
    expect(s.withDebt).toBe(2);
    // 2-й срез: выставлен у s1.a, s2.a, s2.b — 3 из 8 (4 студента × 2 дисциплины)
    expect(s.fill).toEqual({ graded: 3, total: 8 });
    expect(cohortSummary(all, 1).fill).toEqual({ graded: 5, total: 8 });
  });

  it("долги студента — худшая буква по дисциплине; средний группы по дисциплине", () => {
    expect(debtDisciplines(s1)).toEqual([{ disciplineId: "b", discipline: "B", letter: "FX" }]);
    expect(debtDisciplines(s2)).toEqual([]);
    expect(debtDisciplines(s3)).toEqual([{ disciplineId: "a", discipline: "A", letter: "F" }]);
    // a: 85, 97, 30 → 70,7; b: 50, 55 → 52,5
    expect(disciplineAverage(all, "a")).toEqual(g(70.7));
    expect(disciplineAverage(all, "b")).toEqual(g(52.5));
    expect(cohortSummary([], 2)).toMatchObject({ students: 0, average: null, withDebt: 0, fill: { graded: 0, total: 0 } });
  });
});

// ─── Только свой факультет ─────────────────────────────────────────

describe("Деканат видит только свой факультет", () => {
  it("чужой студент по зачётке: нет оценок, проверка layout — false", async () => {
    expect(await getFacultyStudentGrades(gr, eva.recordBookNo)).toBeNull();
    expect(await isFacultyStudent(gr, eva.recordBookNo)).toBe(false);
    expect(await isFacultyStudent(sl, eva.recordBookNo)).toBe(true);
    for (const junk of ["", "x".repeat(100), "25СЛ 0001", "%", "nope"]) {
      expect(await getFacultyStudentGrades(sl, junk)).toBeNull();
      expect(await isFacultyStudent(sl, junk)).toBe(false);
    }
  });

  it("чужая, языковая и несуществующая группа — null", async () => {
    expect(await getFacultyGroupGrades(gr, eva.academicGroupId)).toBeNull();
    expect(await isFacultyGroup(gr, eva.academicGroupId)).toBe(false);
    expect(await isFacultyGroup(sl, eva.academicGroupId)).toBe(true);
    const lang = await db.studentGroup.findFirstOrThrow({ where: { studentId: eva.id }, select: { groupId: true } });
    expect(await getFacultyGroupGrades(sl, lang.groupId)).toBeNull();
    expect(await getFacultyGroupGrades(sl, "no-such-group")).toBeNull();
    expect(await getFacultyGroupGrades(sl, "x".repeat(200))).toBeNull();
  });

  it("обзор курса: все студенты, группы и журналы — своего факультета", async () => {
    const o = (await getCourseOverview(gr, 2))!;
    expect(o.risk.map((r) => r.recordBookNo)).not.toContain(eva.recordBookNo);
    const rbs = [...o.risk.map((r) => r.recordBookNo)];
    const foreign = await db.student.count({ where: { recordBookNo: { in: rbs }, facultyId: { not: gr.facultyId } } });
    expect(foreign).toBe(0);
    const groups = await db.group.findMany({ where: { id: { in: [...o.groups.map((x) => x.id), ...o.journals.map((j) => j.group.id)] } }, select: { facultyId: true } });
    expect(groups.every((x) => x.facultyId === gr.facultyId)).toBe(true);
    expect(o.summary.students).toBe(await db.student.count({ where: { facultyId: gr.facultyId, course: 2 } }));
  });

  it("поиск: чужой студент не находится ни по фамилии, ни по зачётке", async () => {
    const byName = await searchFacultyStudents(gr, `${eva.lastName} ${eva.firstName}`);
    expect(byName.results.map((r) => r.recordBookNo)).not.toContain(eva.recordBookNo);
    const byBook = await searchFacultyStudents(gr, eva.recordBookNo);
    expect(byBook.exact).toBeNull();
    expect(byBook.results).toEqual([]);
  });

  it("курс из адреса — только из курсов факультета", async () => {
    const courses = await getFacultyCourses(sl);
    expect(courses).toEqual([1, 2, 3, 4]);
    for (const bad of [99, "abc", null, "-1"]) expect((await getCourseOverview(sl, bad))!.course).toBe(courses[0]);
    expect((await getCourseOverview(sl, "3"))!.course).toBe(3);
  });
});

// ─── Та же логика, что у студента ──────────────────────────────────

describe("Оценки студента у деканата — те же, что видит сам студент", () => {
  it("Ева по зачётке: тот же MyGrades, что getMyGrades, и для прошлого семестра", async () => {
    const ctx = { userId: eva.userId, studentId: eva.id } as StudentContext;
    const dean = (await getFacultyStudentGrades(sl, eva.recordBookNo))!;
    expect(dean.grades).toEqual(await getMyGrades(ctx));
    expect(dean.student).toMatchObject({ recordBookNo: eva.recordBookNo, course: 2, group: { id: eva.academicGroupId } });
    expect((await getFacultyStudentGrades(sl, eva.recordBookNo, 1))!.grades).toEqual(await getMyGrades(ctx, 1));
    // Номер зачётки из адреса: кириллица закодирована
    expect(recordBookFromParam(encodeURIComponent(eva.recordBookNo))).toBe(eva.recordBookNo);
    expect(recordBookFromParam("%E0%A4%A")).toBe("");
  });

  it("Ева — в группе риска 2 курса с FX по той же дисциплине, что видит сама", async () => {
    const mine = await getMyGrades({ userId: eva.userId, studentId: eva.id } as StudentContext);
    const debts = mine.disciplines.filter(hasFailing).map((d) => d.discipline);
    expect(debts.length).toBeGreaterThan(0);
    const o = (await getCourseOverview(sl, 2))!;
    const row = o.risk.find((r) => r.recordBookNo === eva.recordBookNo)!;
    expect(row).toBeTruthy();
    expect(row.debts.map((d) => d.discipline)).toEqual(debts);
    expect(row.overall).toEqual(mine.overall);
    for (const d of row.debts) expect(o.riskDisciplines.find((x) => x.id === d.disciplineId)!.count).toBeGreaterThan(0);
  });

  it("таблица группы: итоговый балл, средние и долги каждого студента — как в его «Оценках»", async () => {
    const grp = (await getFacultyGroupGrades(sl, eva.academicGroupId))!;
    const members = await db.student.findMany({ where: { academicGroupId: eva.academicGroupId }, select: { id: true, userId: true, recordBookNo: true } });
    expect(grp.students).toHaveLength(members.length);
    for (const m of members) {
      const mine = await getMyGrades({ userId: m.userId, studentId: m.id } as StudentContext);
      const row = grp.students.find((r) => r.recordBookNo === m.recordBookNo)!;
      expect(row.overall).toEqual(mine.overall);
      expect(row.debts).toHaveLength(mine.summary.failing);
      const cells = [...Object.entries(row.cells), ...row.languages.flat().map((l) => [l.disciplineId, l.average] as const)];
      expect(Object.fromEntries(cells)).toEqual(Object.fromEntries(mine.disciplines.map((d) => [d.disciplineId, d.average])));
    }
    // У студента две языковые группы — две колонки «язык», по одной дисциплине в каждой
    expect(grp.languageColumns).toBe(2);
  });

  it("агрегаты 2 курса совпадают с пересчётом по «Оценкам» каждого студента", async () => {
    const o = (await getCourseOverview(sl, 2))!;
    const students = await db.student.findMany({ where: { facultyId: sl.facultyId, course: 2 }, select: { id: true, userId: true, academicGroupId: true } });
    const grades = await Promise.all(students.map((s) => getMyGrades({ userId: s.userId, studentId: s.id } as StudentContext)));
    const overalls = grades.flatMap((x) => (x.overall ? [x.overall.points] : []));
    const cp = o.summary.checkpoint;
    expect(o.summary.average?.points).toBe(averagePoints(overalls));
    expect(o.summary.graded).toBe(overalls.length);
    expect(o.summary.withDebt).toBe(grades.filter((x) => x.summary.failing > 0).length);
    expect(o.summary.fill).toEqual({
      graded: grades.reduce((n, x) => n + x.disciplines.filter((d) => d.checkpoints[cp - 1]).length, 0),
      total: grades.reduce((n, x) => n + x.disciplines.length, 0),
    });
    expect(o.summary.distribution.reduce((n, d) => n + d.count, 0)).toBe(students.length);
    expect(o.groups.reduce((n, x) => n + x.summary.students, 0)).toBe(students.length);
    expect(o.risk).toHaveLength(o.summary.withDebt);
    // Журналы отсортированы: сначала меньшая доля выставленных
    const shares = o.journals.map((j) => j.graded / j.total);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
  });
});

// ─── Поиск ─────────────────────────────────────────────────────────

describe("Поиск студента", () => {
  it("по номеру зачётки — точное совпадение без учёта регистра", async () => {
    const r = await searchFacultyStudents(sl, eva.recordBookNo.toLowerCase());
    expect(r.exact).toBe(eva.recordBookNo);
    expect(r.results.map((x) => x.recordBookNo)).toContain(eva.recordBookNo);
  });

  it("по ФИО — подсказки, не больше 10, без лишних полей", async () => {
    const r = await searchFacultyStudents(sl, `${eva.lastName.slice(0, 4).toLowerCase()} ${eva.firstName}`);
    expect(r.exact).toBeNull();
    expect(r.results.map((x) => x.recordBookNo)).toContain(eva.recordBookNo);
    const many = await searchFacultyStudents(sl, "ов", 100);
    expect(many.results.length).toBe(10);
    expect(Object.keys(many.results[0]!).sort()).toEqual(["course", "fullName", "group", "recordBookNo"]);
  });

  it("% и _ — обычные символы, а не шаблон; пустой и короткий запрос — ничего", async () => {
    for (const q of ["%", "%%", "_", "__", "%ов", "о_"]) expect((await searchFacultyStudents(sl, q)).results).toEqual([]);
    expect(await searchFacultyStudents(sl, "   ")).toEqual({ exact: null, results: [] });
    expect((await searchFacultyStudents(sl, "о")).results).toEqual([]);
    expect((await searchFacultyStudents(sl, `${eva.lastName}${"я".repeat(500)}`)).results).toEqual([]);
  });
});

// ─── Роли: страницы и API ──────────────────────────────────────────

describe("Студент и преподаватель не получают данные деканата", () => {
  const search = (q: string) => searchRoute(new Request(`http://localhost/api/staff/students/search?q=${encodeURIComponent(q)}`));

  it("requireStaff: студента и преподавателя — в свой кабинет, без входа — на /login", async () => {
    as(studentUser);
    await expect(requireStaff()).rejects.toThrow("redirect /today");
    as(teacherUser);
    await expect(requireStaff()).rejects.toThrow("redirect /journal");
    as(null);
    await expect(requireStaff()).rejects.toThrow("redirect /login");
    as(staffUser);
    expect((await requireStaff()).facultyId).toBe(sl.facultyId);
  });

  it("API поиска: 401 без входа, 403 студенту и преподавателю, деканату — только свой факультет", async () => {
    as(null);
    expect((await search(eva.lastName)).status).toBe(401);
    for (const u of [studentUser, teacherUser]) {
      as(u);
      const res = await search(eva.lastName);
      expect(res.status).toBe(403);
      expect(JSON.stringify(await res.json())).not.toContain(eva.recordBookNo);
    }
    as(staffUser);
    const ok = await search(eva.recordBookNo);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toContain("no-store");
    const body = (await ok.json()) as { exact: string; results: Record<string, unknown>[] };
    expect(body.exact).toBe(eva.recordBookNo);
    expect(Object.keys(body.results[0]!).sort()).toEqual(["course", "fullName", "group", "recordBookNo"]);
    expect((await search("x".repeat(65))).status).toBe(400);

    as(await user("dekanat.gr"));
    const other = (await (await search(eva.recordBookNo)).json()) as { exact: string | null; results: unknown[] };
    expect(other).toEqual({ exact: null, results: [] });
    as(null);
  });

  it("страницы деканата вызывают requireStaff; группа и студент проверяются в layout до loading.tsx", () => {
    const dir = path.join(process.cwd(), "app/(app)/(staff)/staff");
    const read = (p: string) => fs.readFileSync(path.join(dir, p), "utf8");
    for (const p of ["grades/(overview)/page.tsx", "grades/group/[groupId]/page.tsx", "grades/student/[recordBookNo]/page.tsx"]) {
      expect(read(p)).toContain("await requireStaff()");
    }
    expect(read("grades/group/[groupId]/layout.tsx")).toMatch(/isFacultyGroup\(ctx, groupId\)\)\) notFound\(\)/);
    expect(read("grades/student/[recordBookNo]/layout.tsx")).toMatch(/isFacultyStudent\(ctx, .*\)\)\) notFound\(\)/);
    // loading.tsx выше этих layout обернул бы их в Suspense — и 404 превратился бы в 200
    for (const p of ["loading.tsx", "grades/loading.tsx"]) expect(fs.existsSync(path.join(dir, p))).toBe(false);
    expect(read("../layout.tsx")).toContain("await requireStaff()");
  });
});
