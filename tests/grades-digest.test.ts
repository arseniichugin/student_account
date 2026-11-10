/**
 * Кратко об оценках для «Сегодня» (getMyGradesDigest): только свои оценки текущего семестра,
 * итоговый балл — тот же, что на экране «Оценки». Только чтение, база не меняется.
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

  it("по умолчанию — не больше двух последних оценок", async () => {
    const digest = await getMyGradesDigest(students[0]!);
    expect(digest.latest.length).toBeLessThanOrEqual(2);
  });
});
