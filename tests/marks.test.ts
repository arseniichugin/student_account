/**
 * Оценки на занятиях: чистые функции (семестры, средние, поиск по дате)
 * и правила доступа слоя данных lib/data/marks.ts.
 *
 * Вторая часть нужна заполненная база: npm run db:setup.
 * Аккаунты берутся из базы (тестовые студенты двух факультетов и их деканаты).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  createMark,
  deleteMark,
  getMyMarksOverview,
  suggestGradableStudents,
  suggestGradableDisciplines,
  suggestGradableLessons,
} from "@/lib/data/marks";
import {
  academicYearStart,
  average,
  formatAverage,
  matchesDateQuery,
  numericGrade,
  pluralMarks,
  semesterHalf,
  semesterRange,
  studentSemesterNo,
} from "@/lib/marks/stats";
import { addDaysIso, dbDateToIso, isoDateToDb, moscowToday } from "@/lib/moscow-time";

describe("Семестры и средние (чистые функции)", () => {
  it("учебный год и половина семестра", () => {
    expect(academicYearStart("2026-11-17")).toBe(2026);
    expect(academicYearStart("2027-01-20")).toBe(2026);
    expect(academicYearStart("2027-06-01")).toBe(2026);
    expect(semesterHalf("2026-09-01")).toBe(1);
    expect(semesterHalf("2027-01-31")).toBe(1);
    expect(semesterHalf("2027-02-01")).toBe(2);
    expect(semesterRange("2026-11-17")).toEqual({ from: "2026-09-01", to: "2027-01-31" });
    expect(semesterRange("2027-04-10")).toEqual({ from: "2027-02-01", to: "2027-08-31" });
  });

  it("номер семестра студента", () => {
    // 3 курс осенью — 5 семестр; весна прошлого года — 4; осень позапрошлого — 1
    expect(studentSemesterNo(3, "2026-11-17", "2026-11-17")).toBe(5);
    expect(studentSemesterNo(3, "2026-11-17", "2026-03-10")).toBe(4);
    expect(studentSemesterNo(3, "2026-11-17", "2024-10-01")).toBe(1);
    expect(studentSemesterNo(1, "2027-03-01", "2027-03-01")).toBe(2);
  });

  it("средний балл, ведомости, склонения", () => {
    expect(average([])).toBeNull();
    expect(average([5, 4, 4])).toBe(4.33);
    expect(formatAverage(4.333)).toBe("4,33");
    expect(formatAverage(null)).toBe("—");
    expect(numericGrade("5")).toBe(5);
    expect(numericGrade("зачтено")).toBeNull();
    expect(numericGrade(null)).toBeNull();
    expect(pluralMarks(1)).toBe("1 оценка");
    expect(pluralMarks(3)).toBe("3 оценки");
    expect(pluralMarks(12)).toBe("12 оценок");
  });

  it("поиск занятия по набранной дате", () => {
    expect(matchesDateQuery("2026-11-12", "")).toBe(true);
    expect(matchesDateQuery("2026-11-12", "12")).toBe(true);
    expect(matchesDateQuery("2026-11-12", "12.11")).toBe(true);
    expect(matchesDateQuery("2026-11-12", "12.11.2026")).toBe(true);
    expect(matchesDateQuery("2026-11-12", "12.11.26")).toBe(true);
    expect(matchesDateQuery("2026-11-12", "2026-11")).toBe(true);
    expect(matchesDateQuery("2026-11-05", "5.11")).toBe(true);
    expect(matchesDateQuery("2026-11-12", "13")).toBe(false);
    expect(matchesDateQuery("2026-11-12", "12.10")).toBe(false);
  });
});

// ─── Доступ к данным ────────────────────────────────────────────────

async function studentCtx(login: string): Promise<StudentContext> {
  const user = await db.user.findUniqueOrThrow({ where: { login }, include: { student: true } });
  return { userId: user.id, studentId: user.student!.id } as StudentContext;
}
async function staffCtxFor(facultyId: string): Promise<StaffContext> {
  const staff = await db.staff.findFirstOrThrow({ where: { facultyId } });
  return { userId: staff.userId, staffId: staff.id, facultyId } as StaffContext;
}

let studentA: StudentContext;
let studentB: StudentContext;
let staffA: StaffContext; // деканат факультета A
let staffB: StaffContext; // деканат факультета B
let groupsA: string[];
const created: string[] = [];
const today = moscowToday();

beforeAll(async () => {
  const demo = await db.student.findMany({
    where: { user: { isDemo: true } },
    orderBy: [{ faculty: { sortOrder: "asc" } }, { externalId: "asc" }],
    select: { facultyId: true, user: { select: { login: true } } },
  });
  const a = demo[0]!;
  const b = demo.find((s) => s.facultyId !== a.facultyId)!;
  studentA = await studentCtx(a.user.login);
  studentB = await studentCtx(b.user.login);
  staffA = await staffCtxFor(a.facultyId);
  staffB = await staffCtxFor(b.facultyId);
  const s = await db.student.findUniqueOrThrow({
    where: { id: studentA.studentId },
    select: { academicGroupId: true, languageGroups: { select: { groupId: true } } },
  });
  groupsA = [s.academicGroupId, ...s.languageGroups.map((g) => g.groupId)];
});

afterAll(async () => {
  await db.mark.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

/** Прошедшее (до сегодняшнего дня) занятие группы студента A. */
async function pastLessonOfA() {
  return db.lesson.findFirstOrThrow({
    where: { status: { not: "CANCELLED" }, groups: { some: { groupId: { in: groupsA }, date: { lt: isoDateToDb(today) } } } },
    orderBy: { date: "desc" },
    select: { id: true, disciplineId: true, date: true },
  });
}

describe("Оценки: доступ", () => {
  it("обзор студента: семестры с 1-го по текущий, неделя — последние 7 дней", async () => {
    const o = await getMyMarksOverview(studentA);
    expect(o.bySemester.length).toBe(o.semesterNo);
    expect(o.lastWeek.marks.every((m) => m.date >= addDaysIso(today, -6) && m.date <= today)).toBe(true);
  });

  it("студент видит в обзоре только свои оценки", async () => {
    // проверяется после того, как в тесте ниже появятся оценки; здесь — что чужих нет и в пустом обзоре
    const o = await getMyMarksOverview(studentA);
    const ids = o.byDiscipline.flatMap((d) => d.marks.map((m) => m.id));
    const foreign = await db.mark.count({ where: { id: { in: ids }, studentId: { not: studentA.studentId } } });
    expect(foreign).toBe(0);
  });

  it("сотрудник ставит несколько оценок на одном занятии, и они видны студенту", async () => {
    const lesson = await pastLessonOfA();
    const before = await db.mark.count({ where: { studentId: studentA.studentId, lessonId: lesson.id } });
    for (const value of [5, 3]) {
      const r = await createMark(staffA, { studentId: studentA.studentId, lessonId: lesson.id, value });
      expect(r.ok).toBe(true);
    }
    const marks = await db.mark.findMany({
      where: { studentId: studentA.studentId, lessonId: lesson.id, createdById: staffA.staffId },
      select: { id: true, date: true, disciplineId: true },
    });
    created.push(...marks.map((m) => m.id));
    expect(await db.mark.count({ where: { studentId: studentA.studentId, lessonId: lesson.id } })).toBe(before + 2);
    expect(dbDateToIso(marks[0]!.date)).toBe(dbDateToIso(lesson.date));
    expect(marks[0]!.disciplineId).toBe(lesson.disciplineId);
  });

  it("деканат другого факультета не может поставить, найти или удалить оценку студента", async () => {
    const lesson = await pastLessonOfA();
    const r = await createMark(staffB, { studentId: studentA.studentId, lessonId: lesson.id, value: 2 });
    expect(r.ok).toBe(false);

    const student = await db.student.findUniqueOrThrow({ where: { id: studentA.studentId }, select: { lastName: true } });
    const found = await suggestGradableStudents(staffB, student.lastName);
    expect(found.some((x) => x.id === studentA.studentId)).toBe(false);
    expect(await suggestGradableDisciplines(staffB, studentA.studentId, "")).toEqual([]);
    expect(await suggestGradableLessons(staffB, studentA.studentId, lesson.disciplineId, "")).toEqual([]);

    const markId = created[0]!; // оценка из предыдущего теста
    expect(await deleteMark(staffB, markId)).toBe(false);
    expect(await db.mark.count({ where: { id: markId } })).toBe(1);
  });

  it("нельзя поставить оценку за чужое занятие или за занятие в будущем", async () => {
    // занятие, в котором нет ни одной группы студента A
    const foreign = await db.lesson.findFirstOrThrow({
      where: { date: { lte: isoDateToDb(today) }, groups: { none: { groupId: { in: groupsA } } } },
      select: { id: true },
    });
    const r1 = await createMark(staffA, { studentId: studentA.studentId, lessonId: foreign.id, value: 5 });
    expect(r1.ok).toBe(false);

    const future = await db.lesson.findFirst({
      where: { groups: { some: { groupId: { in: groupsA }, date: { gt: isoDateToDb(today) } } } },
      select: { id: true },
    });
    if (future) {
      const r2 = await createMark(staffA, { studentId: studentA.studentId, lessonId: future.id, value: 5 });
      expect(r2.ok).toBe(false);
    }
  });

  it("подсказки — не больше 5 и только по прошедшим занятиям студента", async () => {
    const lesson = await pastLessonOfA();
    const disciplines = await suggestGradableDisciplines(staffA, studentA.studentId, "");
    expect(disciplines.length).toBeGreaterThan(0);
    expect(disciplines.length).toBeLessThanOrEqual(5);
    const lessons = await suggestGradableLessons(staffA, studentA.studentId, lesson.disciplineId, "");
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.length).toBeLessThanOrEqual(5);
    // занятие, для которого мы ставили оценки, помечено «уже: …»
    const withMarks = await suggestGradableLessons(staffA, studentA.studentId, lesson.disciplineId, "");
    expect(withMarks.some((l) => l.id === lesson.id && l.meta.includes("уже:"))).toBe(true);
    const rows = await db.lesson.findMany({ where: { id: { in: lessons.map((l) => l.id) } }, select: { date: true } });
    expect(rows.every((l) => dbDateToIso(l.date) <= today)).toBe(true);
  });

  it("свой деканат может удалить оценку; студент B не видит оценок студента A", async () => {
    const id = created.pop()!;
    expect(await deleteMark(staffA, id)).toBe(true);
    const oB = await getMyMarksOverview(studentB);
    const idsB = oB.byDiscipline.flatMap((d) => d.marks.map((m) => m.id));
    expect(await db.mark.count({ where: { id: { in: idsB }, studentId: studentA.studentId } })).toBe(0);
  });
});
