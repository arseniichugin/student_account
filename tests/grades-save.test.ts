/**
 * Сохранение оценок журнала — надёжность (замечания проверки этапа 3):
 *  — две вкладки / два семинариста: оптимистичная блокировка, без тихой перезаписи чужой оценки (N-03);
 *  — параллельные сохранения одной ячейки — одна запись и одно уведомление;
 *  — лимит частоты сохранений на преподавателя с понятным сообщением (R-01);
 *  — поддельный ввод — только русские сообщения, без английского текста Zod (R-09);
 *  — лёгкие проверки принадлежности для layout (настоящий 404): назначение и заявка (R-04).
 *
 * Нужна заполненная база: npm run db:setup. Удаляет только оценки и уведомления, которые создал сам.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StudentContext, TeacherContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { SAVE_LIMIT, isMyAssignment, saveGrades } from "@/lib/data/grades";
import { isMyRequest } from "@/lib/data/requests";
import { semesterForCourse } from "@/lib/grades/term";

function teacherCtx(t: { id: string; userId: string | null }): TeacherContext {
  return { userId: t.userId ?? "", teacherId: t.id } as TeacherContext;
}

type Member = { id: string; userId: string; course: number };
type GradeKey = { studentId: string; disciplineId: string; semester: number; kind: "CHECKPOINT"; checkpoint: number };

let teacher: TeacherContext;
let own: { id: string; disciplineId: string; groupId: string };
let members: Member[];
const startedAt = new Date();
const touched: GradeKey[] = [];
const notified = new Set<string>();

beforeAll(async () => {
  const t = await db.teacher.findFirstOrThrow({
    where: { user: { isDemo: true }, assignments: { some: {} } },
    orderBy: { shortName: "asc" },
    select: { id: true, userId: true },
  });
  teacher = teacherCtx(t);
  own = await db.teachingAssignment.findFirstOrThrow({
    where: { teacherId: t.id },
    orderBy: { id: "asc" },
    select: { id: true, disciplineId: true, groupId: true },
  });
  members = await db.student.findMany({
    where: { OR: [{ academicGroupId: own.groupId }, { languageGroups: { some: { groupId: own.groupId } } }] },
    select: { id: true, userId: true, course: true },
    orderBy: { id: "asc" },
  });
  expect(members.length).toBeGreaterThan(0);
});

afterAll(async () => {
  for (const key of touched) await db.grade.deleteMany({ where: { ...key, createdAt: { gte: startedAt } } });
  await db.notification.deleteMany({ where: { type: "GRADE", userId: { in: [...notified] }, createdAt: { gte: startedAt } } });
  await db.$disconnect();
});

/** Пустые ячейки срезов группы — по базе, не полагаясь на seed. Каждую тест «забирает» себе. */
async function takeEmptyCells(n: number) {
  const taken = await db.grade.findMany({
    where: { disciplineId: own.disciplineId, studentId: { in: members.map((m) => m.id) }, kind: "CHECKPOINT" },
    select: { studentId: true, semester: true, checkpoint: true },
  });
  const cells: { student: Member; checkpoint: 1 | 2 | 3; key: GradeKey }[] = [];
  for (const checkpoint of [3, 2, 1] as const) {
    for (const s of members) {
      const semester = semesterForCourse(s.course);
      const key: GradeKey = { studentId: s.id, disciplineId: own.disciplineId, semester, kind: "CHECKPOINT", checkpoint };
      const busy =
        taken.some((g) => g.studentId === s.id && g.semester === semester && g.checkpoint === checkpoint) ||
        touched.some((k) => k.studentId === s.id && k.checkpoint === checkpoint);
      if (busy) continue;
      touched.push(key);
      notified.add(s.userId);
      cells.push({ student: s, checkpoint, key });
      if (cells.length === n) return cells;
    }
  }
  throw new Error("В группе тестового преподавателя мало пустых ячеек срезов — пересоздайте демо-данные (npm run db:seed)");
}

const pointsIn = async (key: GradeKey) =>
  (await db.grade.findUnique({ where: { studentId_disciplineId_semester_kind_checkpoint: key }, select: { points: true } }))?.points ?? null;
const notificationsOf = (userId: string) => db.notification.count({ where: { userId, type: "GRADE", createdAt: { gte: startedAt } } });

describe("Две вкладки и два семинариста: оптимистичная блокировка", () => {
  it("устаревшее прежнее значение — отказ с ошибкой у поля и свежей строкой, без тихой перезаписи", async () => {
    const [{ student, checkpoint, key }] = await takeEmptyCells(1);
    const entry = { studentId: student.id, kind: "CHECKPOINT" as const, checkpoint };
    const save = (points: number | null, expected: number | null) =>
      saveGrades(teacher, { assignmentId: own.id, entries: [{ ...entry, points, expected }] });

    // Вкладка 1 ставит 70 (ячейка была пустой)
    expect(await save(70, null)).toMatchObject({ ok: true, saved: 1, cleared: 0 });
    const created = await db.grade.findUniqueOrThrow({ where: { studentId_disciplineId_semester_kind_checkpoint: key } });

    // Вкладка 2 всё ещё видит пустую ячейку и ставит 85 — отказ: «Оценку уже поставили: 70»
    const stale = await save(85, null);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.fieldErrors).toEqual([{ index: 0, studentId: student.id, message: "Оценку уже поставили: 70" }]);
    expect(stale.conflict?.students.map((s) => s.id)).toEqual([student.id]);
    expect(stale.conflict?.students[0]!.checkpoints[checkpoint - 1]).toEqual({ points: 70, letter: "D" });
    expect(await pointsIn(key)).toBe(70);

    // Увидев 70, вкладка 2 сохраняет снова — теперь с верным прежним значением
    await new Promise((r) => setTimeout(r, 5));
    expect(await save(85, 70)).toMatchObject({ ok: true, saved: 1 });
    expect(await pointsIn(key)).toBe(85);
    const updated = await db.grade.findUniqueOrThrow({ where: { studentId_disciplineId_semester_kind_checkpoint: key } });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime()); // «последние оценки» на «Сегодня»

    // Стереть по устаревшему значению нельзя; если в базе уже то же, что вводят, — не конфликт, просто «без изменений»
    expect(await save(null, 70)).toMatchObject({ ok: false, fieldErrors: [{ message: "Оценку уже изменили: 85" }] });
    expect(await save(85, 70)).toMatchObject({ ok: true, saved: 0, cleared: 0 });
    expect(await save(null, 85)).toMatchObject({ ok: true, saved: 0, cleared: 1 });
    expect(await save(60, 85)).toMatchObject({ ok: false, fieldErrors: [{ message: "Оценку уже стёрли" }] });
    expect(await pointsIn(key)).toBeNull();
    expect(await notificationsOf(student.userId)).toBe(2); // 70 и 85; стирание — без уведомления
  });

  it("конфликт в одной записи пачки — не сохраняется ничего", async () => {
    const [a, b] = await takeEmptyCells(2);
    expect(
      await saveGrades(teacher, { assignmentId: own.id, entries: [{ studentId: a!.student.id, kind: "CHECKPOINT", checkpoint: a!.checkpoint, points: 75 }] }),
    ).toMatchObject({ ok: true, saved: 1 });
    const result = await saveGrades(teacher, {
      assignmentId: own.id,
      entries: [
        { studentId: b!.student.id, kind: "CHECKPOINT", checkpoint: b!.checkpoint, points: 90, expected: null },
        { studentId: a!.student.id, kind: "CHECKPOINT", checkpoint: a!.checkpoint, points: 95, expected: null },
      ],
    });
    expect(result).toMatchObject({ ok: false, fieldErrors: [{ index: 1, message: "Оценку уже поставили: 75" }] });
    expect(await pointsIn(b!.key)).toBeNull();
    expect(await pointsIn(a!.key)).toBe(75);
  });

  it("параллельные сохранения одной ячейки: одна запись, одно уведомление, остальные — конфликт или «без изменений»", async () => {
    const [same, race] = await takeEmptyCells(2);
    // Шесть одинаковых запросов без прежнего значения (двойной клик, скрипт)
    const sameEntry = { studentId: same!.student.id, kind: "CHECKPOINT" as const, checkpoint: same!.checkpoint, points: 77 };
    const r1 = await Promise.all(Array.from({ length: 6 }, () => saveGrades(teacher, { assignmentId: own.id, entries: [sameEntry] })));
    expect(r1.every((r) => r.ok)).toBe(true);
    expect(r1.reduce((n, r) => n + (r.ok ? r.saved : 0), 0)).toBe(1);
    expect(await notificationsOf(same!.student.userId)).toBe(1);

    // Шесть разных значений от «вкладок», видевших пустую ячейку, — выигрывает ровно одна
    const r2 = await Promise.all(
      [61, 62, 63, 64, 65, 66].map((points) =>
        saveGrades(teacher, {
          assignmentId: own.id,
          entries: [{ studentId: race!.student.id, kind: "CHECKPOINT", checkpoint: race!.checkpoint, points, expected: null }],
        }),
      ),
    );
    const winners = r2.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    expect(r2.filter((r) => !r.ok).every((r) => !r.ok && r.fieldErrors[0]!.message.startsWith("Оценку уже поставили"))).toBe(true);
    expect(await db.grade.count({ where: race!.key })).toBe(1);
  });
});

describe("Лимит частоты сохранений (общий демо-аккаунт)", () => {
  it(`не больше ${SAVE_LIMIT.calls} сохранений за 10 минут на преподавателя — дальше понятный отказ`, async () => {
    const ctx = teacherCtx({ id: `rate-test-calls-${Date.now()}`, userId: null }); // назначений нет — запросы дешёвые
    const input = { assignmentId: own.id, entries: [{ studentId: members[0]!.id, kind: "CHECKPOINT", checkpoint: 1, points: 90 }] };
    for (let i = 0; i < SAVE_LIMIT.calls; i++) expect(await saveGrades(ctx, input)).toMatchObject({ ok: false, error: "Журнал не найден" });
    const limited = await saveGrades(ctx, input);
    expect(limited.ok).toBe(false);
    if (limited.ok) return;
    expect(limited.error).toMatch(/^Слишком много сохранений подряд\. Подождите \d+ мин/);
    expect(limited.error).toContain("введённые оценки останутся в полях");
    expect(limited.retryAfterSec).toBeGreaterThan(0);
    expect(limited.retryAfterSec).toBeLessThanOrEqual(SAVE_LIMIT.windowMs / 1000);
    // Лимит — на преподавателя: другой преподаватель сохраняет как обычно
    expect(await saveGrades(teacherCtx({ id: `rate-test-other-${Date.now()}`, userId: null }), input)).toMatchObject({ error: "Журнал не найден" });
  });

  it(`не больше ${SAVE_LIMIT.grades} оценок за 10 минут, даже крупными пачками`, async () => {
    const ctx = teacherCtx({ id: `rate-test-volume-${Date.now()}`, userId: null });
    const entries = Array.from({ length: 100 }, () => ({ studentId: members[0]!.id, kind: "CHECKPOINT", checkpoint: 1, points: 90 }));
    for (let i = 0; i < SAVE_LIMIT.grades / 100; i++) expect(await saveGrades(ctx, { assignmentId: own.id, entries })).toMatchObject({ error: "Журнал не найден" });
    expect(await saveGrades(ctx, { assignmentId: own.id, entries })).toMatchObject({ ok: false, error: expect.stringMatching(/^Слишком много сохранений/) });
  });
});

describe("Поддельный ввод — только русские сообщения", () => {
  const latin = /[a-z]{3,}/i; // «Invalid input», «expected array» и т. п.

  it("ни одного английского сообщения Zod ни на каком уровне", async () => {
    const sid = members[0]!.id;
    const inputs: unknown[] = [
      null,
      "x",
      42,
      [],
      {},
      { assignmentId: own.id },
      { assignmentId: own.id, entries: "x" },
      { assignmentId: own.id, entries: {} },
      { assignmentId: own.id, entries: [null] },
      { assignmentId: own.id, entries: ["x"] },
      { assignmentId: own.id, entries: [{}] },
      { assignmentId: own.id, entries: [{ kind: "CHECKPOINT" }] },
      { assignmentId: own.id, entries: [{ studentId: 5, kind: "EXAM", points: 1 }] },
      { assignmentId: own.id, entries: [{ studentId: sid, kind: "EXAM" }] },
      { assignmentId: own.id, entries: [{ studentId: sid, kind: "CREDIT", passed: "yes" }] },
      { assignmentId: own.id, entries: [{ studentId: sid, kind: "CHECKPOINT", checkpoint: "1", points: 50 }] },
      { assignmentId: own.id, entries: [{ studentId: sid, kind: "CHECKPOINT", checkpoint: 1, points: 50, expected: "x" }] },
      { assignmentId: own.id, entries: [{ studentId: sid, kind: "CREDIT", passed: true, expected: 5 }] },
      { assignmentId: own.id, entries: [{ studentId: sid, kind: "EXAM", points: [] }] },
    ];
    for (const input of inputs) {
      const r = await saveGrades(teacher, input);
      expect(r.ok, JSON.stringify(input)).toBe(false);
      if (r.ok) continue;
      for (const message of [r.error, ...r.fieldErrors.map((e) => e.message)]) {
        expect(message, JSON.stringify(input)).not.toMatch(latin);
        expect(message, JSON.stringify(input)).toMatch(/[а-яё]/i);
      }
    }
  });
});

describe("Проверки принадлежности для layout (настоящий 404)", () => {
  it("назначение: своё — да; чужое, несуществующее, мусор — нет", async () => {
    expect(await isMyAssignment(teacher, own.id)).toBe(true);
    const foreign = await db.teachingAssignment.findFirstOrThrow({ where: { teacherId: { not: teacher.teacherId } }, select: { id: true } });
    for (const id of [foreign.id, "no-such-id", "", "x".repeat(500)]) expect(await isMyAssignment(teacher, id)).toBe(false);
  });

  it("заявка: своя — да; чужая, несуществующая, мусор — нет", async () => {
    const r = await db.request.findFirstOrThrow({ select: { id: true, student: { select: { id: true, userId: true } } } });
    const mine = { userId: r.student.userId, studentId: r.student.id } as StudentContext;
    expect(await isMyRequest(mine, r.id)).toBe(true);
    const other = await db.student.findFirstOrThrow({ where: { id: { not: r.student.id } }, select: { id: true, userId: true } });
    const stranger = { userId: other.userId, studentId: other.id } as StudentContext;
    expect(await isMyRequest(stranger, r.id)).toBe(false);
    for (const id of ["no-such-id", "", "x".repeat(500)]) expect(await isMyRequest(mine, id)).toBe(false);
  });
});
