/**
 * Кабинет преподавателя: аккаунты, распределение групп, оценки и уведомления только своим группам,
 * события деканата «всем преподавателям» / «преподавателю …».
 * Нужна заполненная база: npm run db:setup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RecipientContext, StaffContext, TeacherContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  createMark,
  deleteMark,
  listRecentMarks,
  suggestGradableDisciplines,
  suggestGradableLessons,
  suggestGradableStudents,
} from "@/lib/data/marks";
import {
  createFacultyAnnouncement,
  createTeacherAnnouncement,
  deleteFacultyAnnouncement,
  deleteTeacherAnnouncement,
  listFacultyAnnouncements,
  listMyNotifications,
  suggestFacultyTeachers,
  suggestTeacherGroups,
  teacherGroupIds,
} from "@/lib/data/notifications";
import { getMyTeacherProfile } from "@/lib/data/teacher";
import { isoDateToDb, moscowToday } from "@/lib/moscow-time";

let teacher: TeacherContext; // ведёт занятия у группы studentInGroup
let otherTeacher: TeacherContext; // другой преподаватель той же группы
let staff: StaffContext; // деканат факультета этой группы
let groupId: string;
let studentInGroup: { id: string; userId: string };
let studentOutside: { id: string };
const createdMarks: string[] = [];
const createdAnnouncements: string[] = [];
const today = moscowToday();
const demoMode = process.env.DEMO_MODE;

const recipient = (userId: string, role: "STUDENT" | "TEACHER") => ({ userId, role }) as RecipientContext;

beforeAll(async () => {
  delete process.env.DEMO_MODE; // строгий лимит демо-стенда тесту мешал бы
  // Группа тестового студента и два разных преподавателя, которые ведут у неё прошедшие занятия
  const demo = await db.student.findFirstOrThrow({
    where: { user: { isDemo: true } },
    orderBy: [{ faculty: { sortOrder: "asc" } }, { externalId: "asc" }],
    select: { id: true, userId: true, academicGroupId: true, facultyId: true },
  });
  groupId = demo.academicGroupId;
  studentInGroup = { id: demo.id, userId: demo.userId };
  const lessons = await db.lesson.findMany({
    where: { status: { not: "CANCELLED" }, date: { lt: isoDateToDb(today) }, groups: { some: { groupId } }, teacherId: { not: null } },
    distinct: ["teacherId"],
    select: { teacher: { select: { id: true, userId: true } } },
  });
  const [t1, t2] = lessons.map((l) => l.teacher!);
  teacher = { userId: t1!.userId!, teacherId: t1!.id } as TeacherContext;
  otherTeacher = { userId: t2!.userId!, teacherId: t2!.id } as TeacherContext;
  const st = await db.staff.findFirstOrThrow({ where: { facultyId: demo.facultyId } });
  staff = { userId: st.userId, staffId: st.id, facultyId: demo.facultyId } as StaffContext;
  // Студент, который не учится ни в одной группе преподавателя
  const groups = await teacherGroupIds(teacher.teacherId);
  studentOutside = await db.student.findFirstOrThrow({
    where: { academicGroupId: { notIn: groups }, languageGroups: { none: { groupId: { in: groups } } } },
    select: { id: true },
  });
});

afterAll(async () => {
  if (demoMode !== undefined) process.env.DEMO_MODE = demoMode;
  await db.mark.deleteMany({ where: { id: { in: createdMarks } } });
  await db.announcement.deleteMany({ where: { id: { in: createdAnnouncements } } });
  await db.$disconnect();
});

describe("Аккаунты и распределение групп", () => {
  it("у каждого преподавателя есть аккаунт с ролью TEACHER и уникальным логином", async () => {
    const teachers = await db.teacher.findMany({ select: { user: { select: { role: true, login: true } } } });
    expect(teachers.length).toBeGreaterThan(0);
    expect(teachers.every((t) => t.user?.role === "TEACHER")).toBe(true);
    expect(new Set(teachers.map((t) => t.user!.login)).size).toBe(teachers.length);
    expect(await db.user.count({ where: { role: "TEACHER", teacher: null } })).toBe(0);
  });

  it("общий демо-пароль — только у тестовых преподавателей, по одному на тестового студента", async () => {
    const testStudents = await db.student.findMany({ where: { user: { isDemo: true } }, select: { id: true, academicGroupId: true } });
    expect(testStudents.length).toBeGreaterThan(0);
    const testTeachers = await db.teacher.findMany({ where: { user: { isDemo: true } }, select: { id: true } });
    if (!process.env.TEST_TEACHER_LOGINS) expect(testTeachers.length).toBe(testStudents.length);
    expect(await db.user.count({ where: { role: "TEACHER", isDemo: true } })).toBe(testTeachers.length);
    // Каждый тестовый студент учится в группе хотя бы одного тестового преподавателя
    const groups = new Set(
      (await Promise.all(testTeachers.map((t) => teacherGroupIds(t.id)))).flat(),
    );
    for (const s of testStudents) expect(groups.has(s.academicGroupId)).toBe(true);
  });

  it("у пары (группа, предмет) один преподаватель; исключение — лекция потока у другого лектора", async () => {
    const rows = await db.lessonGroup.findMany({
      select: { groupId: true, lesson: { select: { disciplineId: true, teacherId: true, kind: true } } },
    });
    const byPair = new Map<string, { all: Set<string>; nonLecture: Set<string> }>();
    for (const r of rows) {
      const key = `${r.groupId}:${r.lesson.disciplineId}`;
      const v = byPair.get(key) ?? { all: new Set(), nonLecture: new Set() };
      v.all.add(r.lesson.teacherId ?? "");
      if (!/лекц/i.test(r.lesson.kind)) v.nonLecture.add(r.lesson.teacherId ?? "");
      byPair.set(key, v);
    }
    for (const v of byPair.values()) {
      expect(v.nonLecture.size).toBeLessThanOrEqual(1);
      expect(v.all.size).toBeLessThanOrEqual(2);
    }
    // У большинства групп всё ведёт один преподаватель
    const single = [...byPair.values()].filter((v) => v.all.size === 1).length;
    expect(single / byPair.size).toBeGreaterThan(0.9);
  });

  it("профиль преподавателя: его группы и дисциплины", async () => {
    const p = await getMyTeacherProfile(teacher);
    expect(p.groups.some((g) => g.id === groupId)).toBe(true);
    expect(p.disciplines.length).toBeGreaterThan(0);
  });
});

describe("Оценки преподавателя", () => {
  it("в подсказках — только студенты его групп", async () => {
    const outsider = await db.student.findUniqueOrThrow({ where: { id: studentOutside.id }, select: { lastName: true } });
    const found = await suggestGradableStudents(teacher, outsider.lastName);
    expect(found.some((s) => s.id === studentOutside.id)).toBe(false);
    expect(await suggestGradableDisciplines(teacher, studentOutside.id, "")).toEqual([]);
  });

  it("ставит оценку только за своё занятие; чужое занятие той же группы — нельзя", async () => {
    const own = await db.lesson.findFirstOrThrow({
      where: { teacherId: teacher.teacherId, status: { not: "CANCELLED" }, date: { lt: isoDateToDb(today) }, groups: { some: { groupId } } },
      select: { id: true, disciplineId: true },
    });
    const foreign = await db.lesson.findFirstOrThrow({
      where: { teacherId: otherTeacher.teacherId, status: { not: "CANCELLED" }, date: { lt: isoDateToDb(today) }, groups: { some: { groupId } } },
      select: { id: true },
    });
    const ok = await createMark(teacher, { studentId: studentInGroup.id, lessonId: own.id, value: 5 });
    expect(ok).toMatchObject({ ok: true });
    const mark = await db.mark.findFirstOrThrow({
      where: { teacherId: teacher.teacherId, studentId: studentInGroup.id, lessonId: own.id },
      orderBy: { createdAt: "desc" },
    });
    createdMarks.push(mark.id);
    expect(mark.createdById).toBeNull();
    expect((await createMark(teacher, { studentId: studentInGroup.id, lessonId: foreign.id, value: 5 })).ok).toBe(false);
    // В подсказках дат — только его занятия
    const dates = await suggestGradableLessons(teacher, studentInGroup.id, own.disciplineId, "");
    const ids = dates.map((d) => d.id);
    const teachers = await db.lesson.findMany({ where: { id: { in: ids } }, select: { teacherId: true } });
    expect(teachers.every((l) => l.teacherId === teacher.teacherId)).toBe(true);
    expect((await listRecentMarks(teacher)).some((m) => m.id === mark.id)).toBe(true);
  });

  it("удаляет только свои оценки; другой преподаватель — не может", async () => {
    const id = createdMarks[0]!;
    expect(await deleteMark(otherTeacher, id)).toBe(false);
    expect(await deleteMark(teacher, id)).toBe(true);
    createdMarks.shift();
  });
});

describe("Уведомления преподавателя", () => {
  it("«всем моим группам» и «группе» — только студенты его групп; чужая группа и «всем факультета» — нельзя", async () => {
    const all = await createTeacherAnnouncement(teacher, {
      kind: "ANNOUNCEMENT",
      title: "Всем моим группам",
      body: "Текст",
      audience: { type: "myGroups" },
      sendAt: null,
    });
    expect(all.ok).toBe(true);
    if (all.ok) createdAnnouncements.push(all.id);
    const groups = await teacherGroupIds(teacher.teacherId);
    const expected = await db.student.count({
      where: { OR: [{ academicGroupId: { in: groups } }, { languageGroups: { some: { groupId: { in: groups } } } }] },
    });
    expect(all.ok && all.recipients).toBe(expected);
    const mine = await listMyNotifications(recipient(studentInGroup.userId, "STUDENT"));
    expect(mine.find((n) => n.title === "Всем моим группам")?.from).toMatch(/^Преподаватель/);

    const outsiderGroup = await db.student.findUniqueOrThrow({ where: { id: studentOutside.id }, select: { academicGroupId: true } });
    const foreign = await createTeacherAnnouncement(teacher, {
      kind: "ANNOUNCEMENT",
      title: "Чужой группе",
      body: "Текст",
      audience: { type: "group", groupId: outsiderGroup.academicGroupId },
      sendAt: null,
    });
    expect(foreign.ok).toBe(false);
    const faculty = await createTeacherAnnouncement(teacher, {
      kind: "ANNOUNCEMENT",
      title: "Всем",
      body: "Текст",
      audience: { type: "faculty" },
      sendAt: null,
    });
    expect(faculty.ok).toBe(false);
    expect((await suggestTeacherGroups(teacher, "")).every((g) => groups.includes(g.id))).toBe(true);
  });

  it("событие преподавателя не видно и не удаляется деканатом; другой преподаватель его не удалит", async () => {
    const id = createdAnnouncements[0]!;
    expect((await listFacultyAnnouncements(staff)).some((a) => a.id === id)).toBe(false);
    expect(await deleteFacultyAnnouncement(staff, id)).toBe(false);
    expect(await deleteTeacherAnnouncement(otherTeacher, id)).toBe(false);
  });

  it("деканат: «всем преподавателям» и «преподавателю …» — приходят преподавателю", async () => {
    const all = await createFacultyAnnouncement(staff, {
      kind: "DEADLINE",
      title: "Всем преподавателям (тест)",
      body: "Текст",
      audience: { type: "allTeachers" },
      sendAt: null,
    });
    expect(all.ok).toBe(true);
    if (all.ok) createdAnnouncements.push(all.id);
    const one = await createFacultyAnnouncement(staff, {
      kind: "ANNOUNCEMENT",
      title: "Лично преподавателю (тест)",
      body: "Текст",
      audience: { type: "teacher", teacherId: teacher.teacherId },
      sendAt: null,
    });
    expect(one.ok && one.recipients).toBe(1);
    if (one.ok) createdAnnouncements.push(one.id);
    const inbox = await listMyNotifications(recipient(teacher.userId, "TEACHER"));
    expect(inbox.some((n) => n.title === "Всем преподавателям (тест)" && n.from === "Деканат")).toBe(true);
    expect(inbox.some((n) => n.title === "Лично преподавателю (тест)")).toBe(true);
    // Студенты «всем преподавателям» не получают
    const student = await listMyNotifications(recipient(studentInGroup.userId, "STUDENT"));
    expect(student.some((n) => n.title === "Всем преподавателям (тест)")).toBe(false);
    // В подсказках деканата есть этот преподаватель
    const p = await getMyTeacherProfile(teacher);
    expect((await suggestFacultyTeachers(staff, p.shortName.split(" ")[0]!)).some((t) => t.id === teacher.teacherId)).toBe(true);
  });

  it("деканат не может написать преподавателю, который не ведёт занятия у его факультета", async () => {
    const outsider = await db.teacher.findFirst({
      where: { userId: { not: null }, lessons: { none: { groups: { some: { group: { facultyId: staff.facultyId } } } } } },
      select: { id: true },
    });
    if (!outsider) return; // все преподаватели ведут занятия у этого факультета
    const r = await createFacultyAnnouncement(staff, {
      kind: "ANNOUNCEMENT",
      title: "Чужому преподавателю",
      body: "Текст",
      audience: { type: "teacher", teacherId: outsider.id },
      sendAt: null,
    });
    expect(r.ok).toBe(false);
  });
});
