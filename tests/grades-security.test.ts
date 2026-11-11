/**
 * Безопасность успеваемости (docs/specs/grades.md, §7):
 *  — преподаватель видит студентов и ставит оценки ТОЛЬКО по своим назначениям;
 *  — студент не из группы, экзамен вместо зачёта, баллы вне 0–100 и дробные — отказ, ничего не сохраняется;
 *  — студент видит только свои оценки; преподаватель без назначений не видит ни одной группы;
 *  — сохранённая оценка уведомляет студента.
 *
 * Нужна заполненная база: npm run db:setup. Аккаунты берутся из базы (тестовые студенты и преподаватели),
 * тест не зависит от конкретных файлов вуза. Всё, что тест меняет, он возвращает назад: удаляет только
 * те оценки и уведомления, которые создал сам (ключи собираются по ходу), и не полагается на то, какие
 * ячейки seed оставил пустыми.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StudentContext, TeacherContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getJournal, getMyAssignments, getMyGrades, saveGrades } from "@/lib/data/grades";
import { semesterForCourse } from "@/lib/grades/term";

async function studentCtx(login: string): Promise<StudentContext> {
  const user = await db.user.findUniqueOrThrow({ where: { login }, include: { student: true } });
  return { userId: user.id, studentId: user.student!.id } as StudentContext;
}
function teacherCtx(t: { id: string; userId: string | null }): TeacherContext {
  return { userId: t.userId ?? "", teacherId: t.id } as TeacherContext;
}

/** Студенты группы — как их понимает журнал: академическая группа или языковая (StudentGroup). */
const membersOf = (groupId: string) =>
  db.student.findMany({
    where: { OR: [{ academicGroupId: groupId }, { languageGroups: { some: { groupId } } }] },
    select: { id: true, userId: true, course: true },
    orderBy: { id: "asc" },
  });

let teacher: TeacherContext; // тестовый преподаватель 1
let own: { id: string; disciplineId: string; groupId: string; finalKind: "EXAM" | "CREDIT" | null };
let ownStudent: { id: string; userId: string; course: number };
let studentA: StudentContext; // тестовый студент 1 — в группе преподавателя
let studentB: StudentContext; // тестовый студент 2
const startedAt = new Date();
/** Ячейки, куда тест ставил оценки, и студенты, которым уходили уведомления, — в конце убрать только их. */
type GradeKey = { studentId: string; disciplineId: string; semester: number; kind: "CHECKPOINT" | "EXAM" | "CREDIT"; checkpoint: number };
const touchedGrades: GradeKey[] = [];
const notifiedUserIds = new Set<string>();
const tempUserIds: string[] = [];
const tempTeacherIds: string[] = [];

beforeAll(async () => {
  const demoStudents = await db.student.findMany({
    where: { user: { isDemo: true } },
    orderBy: [{ faculty: { sortOrder: "asc" } }, { course: "asc" }],
    select: { id: true, academicGroupId: true, languageGroups: { select: { groupId: true } }, user: { select: { login: true } } },
  });
  studentA = await studentCtx(demoStudents[0]!.user.login);
  studentB = await studentCtx(demoStudents[1]!.user.login);
  const groupsA = [demoStudents[0]!.academicGroupId, ...demoStudents[0]!.languageGroups.map((g) => g.groupId)];

  const t = await db.teacher.findFirstOrThrow({
    where: { user: { isDemo: true }, assignments: { some: { groupId: { in: groupsA } } } },
    select: { id: true, userId: true },
  });
  teacher = teacherCtx(t);
  own = await db.teachingAssignment.findFirstOrThrow({
    where: { teacherId: t.id, groupId: { in: groupsA } },
    select: { id: true, disciplineId: true, groupId: true, finalKind: true },
  });
  ownStudent = (await membersOf(own.groupId)).find((s) => s.id === studentA.studentId)!;
  expect(ownStudent).toBeDefined();
});

afterAll(async () => {
  // Оценки и уведомления, созданные тестом, — убрать (и только их)
  for (const key of touchedGrades) await db.grade.deleteMany({ where: { ...key, createdAt: { gte: startedAt } } });
  await db.notification.deleteMany({ where: { type: "GRADE", userId: { in: [...notifiedUserIds] }, createdAt: { gte: startedAt } } });
  await db.teacher.deleteMany({ where: { id: { in: tempTeacherIds } } });
  await db.user.deleteMany({ where: { id: { in: tempUserIds } } });
  await db.$disconnect();
});

const gradeCount = (where: { studentId?: string; disciplineId?: string } = {}) => db.grade.count({ where });

/**
 * Пустая ячейка среза в группе own — ищется по базе, а не «3-й срез, его seed не ставит».
 * Сначала — у тестового студента 1 (его оценку проверяем ещё и глазами студента).
 */
async function findEmptyCheckpoint() {
  const members = await membersOf(own.groupId);
  const ordered = [ownStudent, ...members.filter((m) => m.id !== ownStudent.id)];
  const taken = await db.grade.findMany({
    where: { disciplineId: own.disciplineId, studentId: { in: members.map((m) => m.id) }, kind: "CHECKPOINT" },
    select: { studentId: true, semester: true, checkpoint: true },
  });
  for (const s of ordered) {
    const semester = semesterForCourse(s.course);
    for (const checkpoint of [3, 2, 1] as const) {
      if (taken.some((g) => g.studentId === s.id && g.semester === semester && g.checkpoint === checkpoint)) continue;
      const key: GradeKey = { studentId: s.id, disciplineId: own.disciplineId, semester, kind: "CHECKPOINT", checkpoint };
      touchedGrades.push(key);
      notifiedUserIds.add(s.userId);
      return { student: s, checkpoint, key };
    }
  }
  throw new Error("В группе тестового преподавателя нет ни одной пустой ячейки среза — пересоздайте демо-данные (npm run db:seed)");
}

describe("Преподаватель работает только со своими группами", () => {
  it("список журналов — только свои назначения, без чужих", async () => {
    const mine = await getMyAssignments(teacher);
    const expected = await db.teachingAssignment.findMany({ where: { teacherId: teacher.teacherId }, select: { id: true } });
    expect(mine.map((a) => a.id).sort()).toEqual(expected.map((a) => a.id).sort());
    expect(mine.length).toBeGreaterThan(0);
  });

  it("журнал своей группы — все студенты группы, и только они", async () => {
    const journal = await getJournal(teacher, own.id);
    expect(journal).not.toBeNull();
    const members = await membersOf(own.groupId);
    expect(journal!.students.map((s) => s.id).sort()).toEqual(members.map((s) => s.id).sort());
    expect(journal!.assignment.studentCount).toBe(members.length);
  });

  it("чужая группа: журнал не открывается, оценку поставить нельзя", async () => {
    // Назначение другого преподавателя, пары которого у нашего нет
    const foreign = await db.teachingAssignment.findFirstOrThrow({
      where: { teacherId: { not: teacher.teacherId }, NOT: { group: { assignments: { some: { teacherId: teacher.teacherId } } } } },
      select: { id: true, groupId: true, disciplineId: true },
    });
    expect(await getJournal(teacher, foreign.id)).toBeNull();

    const victim = (await membersOf(foreign.groupId))[0]!;
    const before = await gradeCount({ studentId: victim.id, disciplineId: foreign.disciplineId });
    const result = await saveGrades(teacher, {
      assignmentId: foreign.id,
      entries: [{ studentId: victim.id, kind: "CHECKPOINT", checkpoint: 3, points: 100 }],
    });
    expect(result).toEqual({ ok: false, error: "Журнал не найден", fieldErrors: [] });
    expect(await gradeCount({ studentId: victim.id, disciplineId: foreign.disciplineId })).toBe(before);
  });

  it("несуществующий и мусорный id назначения — тот же ответ, что и чужой", async () => {
    for (const id of ["no-such-assignment", "", "x".repeat(500)]) {
      expect(await getJournal(teacher, id)).toBeNull();
      const r = await saveGrades(teacher, { assignmentId: id, entries: [{ studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 3, points: 90 }] });
      expect(r).toMatchObject({ ok: false, error: "Журнал не найден" });
    }
  });

  it("студент не из группы назначения — отказ, ничего не сохраняется (и для остальных записей пачки)", async () => {
    const outsider = await db.student.findFirstOrThrow({
      where: { NOT: { OR: [{ academicGroupId: own.groupId }, { languageGroups: { some: { groupId: own.groupId } } }] } },
      select: { id: true },
    });
    const before = await gradeCount({ disciplineId: own.disciplineId });
    const result = await saveGrades(teacher, {
      assignmentId: own.id,
      entries: [
        { studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 3, points: 90 },
        { studentId: outsider.id, kind: "CHECKPOINT", checkpoint: 3, points: 90 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toEqual([{ index: 1, studentId: outsider.id, message: expect.any(String) }]);
    expect(await gradeCount({ disciplineId: own.disciplineId })).toBe(before);
  });

  it("экзамен за зачётную дисциплину и зачёт за экзаменационную — отказ", async () => {
    for (const [finalKind, wrong] of [
      ["CREDIT", { kind: "EXAM", points: 90 }],
      ["EXAM", { kind: "CREDIT", passed: true }],
    ] as const) {
      const a = await db.teachingAssignment.findFirstOrThrow({
        where: { finalKind },
        select: { id: true, groupId: true, disciplineId: true, teacher: { select: { id: true, userId: true } } },
      });
      const s = (await membersOf(a.groupId))[0]!;
      const before = await gradeCount({ studentId: s.id, disciplineId: a.disciplineId });
      const result = await saveGrades(teacherCtx(a.teacher), { assignmentId: a.id, entries: [{ studentId: s.id, ...wrong }] });
      expect(result.ok, `${wrong.kind} при итоговом ${finalKind}`).toBe(false);
      if (!result.ok) expect(result.fieldErrors[0]!.message).toMatch(/Итоговый контроль/);
      expect(await gradeCount({ studentId: s.id, disciplineId: a.disciplineId })).toBe(before);
    }
  });

  it("баллы 101, −1, дробные, строкой; срез 4; неизвестный вид — отказ Zod, ничего не сохраняется", async () => {
    const before = await gradeCount({ disciplineId: own.disciplineId });
    const bad: unknown[] = [
      { studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 3, points: 101 },
      { studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 3, points: -1 },
      { studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 3, points: 85.5 },
      { studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 3, points: "85" },
      { studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 4, points: 85 },
      { studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 0, points: 85 },
      { studentId: ownStudent.id, kind: "COURSEWORK", points: 85 },
      { studentId: ownStudent.id, kind: "EXAM", points: Number.POSITIVE_INFINITY },
    ];
    for (const entry of bad) {
      const result = await saveGrades(teacher, { assignmentId: own.id, entries: [entry] });
      expect(result.ok, JSON.stringify(entry)).toBe(false);
      if (!result.ok) expect(result.fieldErrors[0]?.index).toBe(0);
    }
    expect((await saveGrades(teacher, null)).ok).toBe(false);
    expect((await saveGrades(teacher, { assignmentId: own.id, entries: [] })).ok).toBe(false);
    expect(await gradeCount({ disciplineId: own.disciplineId })).toBe(before);
  });

  it("преподаватель без назначений не видит ни одной группы", async () => {
    const user = await db.user.create({ data: { login: `test-teacher-${Date.now()}`, passwordHash: "$argon2id$x", role: "TEACHER" } });
    tempUserIds.push(user.id);
    const t = await db.teacher.create({
      data: { oid: `test-no-assignments-${Date.now()}`, shortName: "Тестов Т.Т.", fullName: "Тестов Тест Тестович", userId: user.id },
    });
    tempTeacherIds.push(t.id);
    const ctx = teacherCtx(t);
    expect(await getMyAssignments(ctx)).toEqual([]);
    expect(await getJournal(ctx, own.id)).toBeNull();
    const result = await saveGrades(ctx, { assignmentId: own.id, entries: [{ studentId: ownStudent.id, kind: "CHECKPOINT", checkpoint: 3, points: 90 }] });
    expect(result).toMatchObject({ ok: false, error: "Журнал не найден" });
  });

  it("у пары с двумя семинаристами журнал открывается у обоих", async () => {
    const pair = await db.teachingAssignment.groupBy({ by: ["disciplineId", "groupId"], having: { teacherId: { _count: { gt: 1 } } } });
    if (pair.length === 0) return; // в других наборах данных таких пар может не быть
    const both = await db.teachingAssignment.findMany({
      where: { disciplineId: pair[0]!.disciplineId, groupId: pair[0]!.groupId },
      select: { id: true, teacher: { select: { id: true, userId: true } } },
    });
    for (const a of both) expect(await getJournal(teacherCtx(a.teacher), a.id)).not.toBeNull();
  });
});

describe("Сохранение и что видит студент", () => {
  it("оценка сохраняется от имени преподавателя из контекста, студент получает уведомление и видит её", async () => {
    const { student, checkpoint, key } = await findEmptyCheckpoint();
    const entry = { studentId: student.id, kind: "CHECKPOINT" as const, checkpoint };

    const result = await saveGrades(teacher, { assignmentId: own.id, entries: [{ ...entry, points: 85 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({ saved: 1, cleared: 0 });
    expect(result.students.map((s) => s.id)).toEqual([student.id]);
    expect(result.students[0]!.checkpoints[checkpoint - 1]).toEqual({ points: 85, letter: "B" });

    const row = await db.grade.findUniqueOrThrow({ where: { studentId_disciplineId_semester_kind_checkpoint: key } });
    expect(row).toMatchObject({ points: 85, passed: null, gradedByTeacherId: teacher.teacherId });

    const n = await db.notification.findFirstOrThrow({
      where: { userId: student.userId, type: "GRADE", createdAt: { gte: startedAt } },
      orderBy: { createdAt: "desc" },
    });
    expect(n.link).toBe("/grades");
    expect(n.title).toMatch(/^Новая оценка: .+, \d-й срез — B \(85\)$/);
    expect(n.title).toContain(`${checkpoint}-й срез`);

    const mine = await getMyGrades({ userId: student.userId, studentId: student.id } as StudentContext);
    expect(mine.disciplines.find((d) => d.disciplineId === own.disciplineId)!.checkpoints[checkpoint - 1]).toEqual({ points: 85, letter: "B" });

    // Повтор того же значения — без нового уведомления; пустое значение стирает оценку (стёрто ≠ сохранено)
    const again = await saveGrades(teacher, { assignmentId: own.id, entries: [{ ...entry, points: 85 }] });
    expect(again).toMatchObject({ ok: true, saved: 0, cleared: 0 });
    const cleared = await saveGrades(teacher, { assignmentId: own.id, entries: [{ ...entry, points: null }] });
    expect(cleared).toMatchObject({ ok: true, saved: 0, cleared: 1 });
    expect(await db.grade.findUnique({ where: { studentId_disciplineId_semester_kind_checkpoint: key } })).toBeNull();
    expect(await db.notification.count({ where: { userId: student.userId, type: "GRADE", createdAt: { gte: startedAt } } })).toBe(1);
  });

  it("студент видит только свои оценки — ровно те, что в базе у него", async () => {
    for (const ctx of [studentA, studentB]) {
      const mine = await getMyGrades(ctx);
      const rows = await db.grade.findMany({
        where: { studentId: ctx.studentId, semester: mine.currentSemester, kind: "CHECKPOINT" },
        select: { disciplineId: true, checkpoint: true, points: true },
      });
      const shown = mine.disciplines.flatMap((d) =>
        d.checkpoints.flatMap((c, i) => (c ? [{ disciplineId: d.disciplineId, checkpoint: i + 1, points: c.points }] : [])),
      );
      const sort = (x: { disciplineId: string; checkpoint: number; points: number | null }[]) => [...x].sort((a, b) => `${a.disciplineId}${a.checkpoint}`.localeCompare(`${b.disciplineId}${b.checkpoint}`));
      expect(sort(shown)).toEqual(sort(rows));
      expect(mine.disciplines.length).toBeGreaterThan(0);
    }
  });

  it("прошлые семестры — пусто; чужой номер семестра — текущий", async () => {
    const b = await getMyGrades(studentB);
    expect(b.currentSemester).toBeGreaterThan(1); // тестовый студент 2 — не первокурсник
    const past = await getMyGrades(studentB, 1);
    expect(past).toMatchObject({ semester: 1, isCurrent: false, disciplines: [], overall: null });
    expect((await getMyGrades(studentB, 99)).semester).toBe(b.currentSemester);
    expect((await getMyGrades(studentB, "abc")).semester).toBe(b.currentSemester);
  });

  it("у тестового студента 2 есть FX за 1-й срез — долг виден в сводке", async () => {
    const b = await getMyGrades(studentB);
    expect(b.summary.failing).toBeGreaterThan(0);
    expect(b.disciplines.some((d) => d.checkpoints[0]?.letter === "FX")).toBe(true);
  });
});
