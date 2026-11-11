/**
 * Кратко об оценках для «Сегодня» (getMyGradesDigest): только свои оценки текущего семестра,
 * итоговый балл — тот же, что на экране «Оценки». Почти всё — только чтение; тест «сданный итоговый контроль
 * гасит долг» на время ставит одну итоговую оценку и удаляет только её.
 * Нужна заполненная база: npm run db:setup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StudentContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getMyGrades, getMyGradesDigest } from "@/lib/data/grades";
import { hasFailing } from "@/lib/grades/stats";
import { semesterForCourse } from "@/lib/grades/term";

let students: StudentContext[] = [];

beforeAll(async () => {
  const demo = await db.user.findMany({
    where: { isDemo: true, student: { isNot: null } },
    select: { id: true, student: { select: { id: true } } },
  });
  students = demo.map((u) => ({ userId: u.id, studentId: u.student!.id }) as StudentContext);
  expect(students.length).toBeGreaterThan(1);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Блок «Оценки» на «Сегодня»", () => {
  it("итоговый балл и число проблемных дисциплин совпадают с экраном «Оценки»", async () => {
    for (const ctx of students) {
      const [digest, full] = await Promise.all([getMyGradesDigest(ctx), getMyGrades(ctx)]);
      expect(digest.overall).toEqual(full.overall);
      expect(digest.failingDisciplines).toBe(full.disciplines.filter(hasFailing).length);
    }
  });

  it("последние оценки — только свои и только текущего семестра", async () => {
    for (const ctx of students) {
      const digest = await getMyGradesDigest(ctx, 50);
      const student = await db.student.findUniqueOrThrow({ where: { id: ctx.studentId }, select: { course: true } });
      const own = await db.grade.count({ where: { studentId: ctx.studentId, semester: semesterForCourse(student.course) } });
      expect(digest.latest).toHaveLength(Math.min(own, 50));
      const ownDisciplines = new Set(
        (await db.grade.findMany({ where: { studentId: ctx.studentId }, select: { disciplineId: true } })).map((g) => g.disciplineId),
      );
      for (const g of digest.latest) expect(ownDisciplines.has(g.disciplineId)).toBe(true);
    }
  });

  it("сданный итоговый контроль гасит долг за срезы: сводка, «Сегодня» и карточка согласованы", async () => {
    // Студент с FX/F за срез, без итоговой оценки по этой дисциплине — ищем в базе, а не полагаемся на seed
    for (const ctx of students) {
      const before = await getMyGrades(ctx);
      const debt = before.disciplines.find((d) => hasFailing(d) && d.final && !d.finalResult);
      if (!debt) continue;
      const student = await db.student.findUniqueOrThrow({ where: { id: ctx.studentId }, select: { course: true } });
      const created = await db.grade.create({
        data: {
          studentId: ctx.studentId,
          disciplineId: debt.disciplineId,
          semester: semesterForCourse(student.course),
          kind: debt.final!.kind,
          checkpoint: 0,
          ...(debt.final!.kind === "CREDIT" ? { passed: true } : { points: 75 }),
        },
        select: { id: true },
      });
      try {
        const [after, digest] = await Promise.all([getMyGrades(ctx), getMyGradesDigest(ctx)]);
        const card = after.disciplines.find((d) => d.disciplineId === debt.disciplineId)!;
        expect(hasFailing(card)).toBe(false);
        expect(after.summary.failing).toBe(before.summary.failing - 1);
        expect(digest.failingDisciplines).toBe(after.summary.failing);
      } finally {
        await db.grade.delete({ where: { id: created.id } });
      }
      return;
    }
    throw new Error("В демо-данных нет студента с долгом за срез — проверьте seed (FX тестового студента 2)");
  });

  it("число дисциплин с долгом в сводке совпадает со списком дисциплин", async () => {
    for (const ctx of students) {
      const full = await getMyGrades(ctx);
      expect(full.summary.failing).toBe(full.disciplines.filter(hasFailing).length);
    }
  });

  it("по умолчанию — не больше двух последних оценок", async () => {
    const digest = await getMyGradesDigest(students[0]!);
    expect(digest.latest.length).toBeLessThanOrEqual(2);
  });
});
