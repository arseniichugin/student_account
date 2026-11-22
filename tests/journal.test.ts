/**
 * Журнал преподавателя (lib/data/journal.ts): таблица «студенты × занятия» только по своим парам
 * «группа + предмет», посещаемость — только своим студентам за свои начавшиеся занятия.
 * Нужна заполненная база: npm run db:setup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffContext, TeacherContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  JOURNAL_RECENT_LESSONS,
  getJournal,
  getTeacherJournal,
  listFacultyGroupOptions,
  listGroupDisciplineOptions,
  listGroupStudentOptions,
  listTeacherClasses,
  setTeacherAttendance,
} from "@/lib/data/journal";
import { listGradableDisciplines, listGradableLessons } from "@/lib/data/marks";
import { listFacultyCourses } from "@/lib/data/notifications";
import { teacherGroupIds } from "@/lib/data/notifications";
import { journalMessage, safeJournalBack } from "@/lib/validation/journal";

let teacher: TeacherContext;
let other: TeacherContext;
let groupId: string;
let disciplineId: string;
const touched: { studentId: string; lessonOid: string; before: string | null }[] = [];

beforeAll(async () => {
  const t = await db.user.findFirstOrThrow({ where: { role: "TEACHER", isDemo: true }, select: { id: true, teacher: { select: { id: true } } } });
  teacher = { userId: t.id, teacherId: t.teacher!.id } as TeacherContext;
  const o = await db.teacher.findFirstOrThrow({ where: { id: { not: teacher.teacherId }, userId: { not: null } }, select: { id: true, userId: true } });
  other = { userId: o.userId!, teacherId: o.id } as TeacherContext;
  const classes = await listTeacherClasses(teacher);
  const c = classes.find((x) => x.pastLessons > 0)!;
  groupId = c.groupId;
  disciplineId = c.disciplineId;
});

afterAll(async () => {
  // Вернуть посещаемость, как была
  for (const t of touched) {
    if (t.before === null) await db.attendance.deleteMany({ where: { studentId: t.studentId, lessonOid: t.lessonOid } });
    else
      await db.attendance.updateMany({
        where: { studentId: t.studentId, lessonOid: t.lessonOid },
        data: { status: t.before as "PRESENT" | "LATE" | "ABSENT" },
      });
  }
  await db.$disconnect();
});

describe("Журнал преподавателя", () => {
  it("пары «группа + предмет» — только из его занятий", async () => {
    const classes = await listTeacherClasses(teacher);
    expect(classes.length).toBeGreaterThan(0);
    const groups = await teacherGroupIds(teacher.teacherId);
    expect(classes.every((c) => groups.includes(c.groupId))).toBe(true);
  });

  it("таблица: студенты группы × его прошедшие занятия (по умолчанию последние)", async () => {
    const j = (await getTeacherJournal(teacher, groupId, disciplineId))!;
    expect(j).not.toBeNull();
    expect(j.students.length).toBeGreaterThan(0);
    expect(j.lessons.length).toBeGreaterThan(0);
    expect(j.lessons.length).toBeLessThanOrEqual(JOURNAL_RECENT_LESSONS);
    const lessons = await db.lesson.findMany({ where: { id: { in: j.lessons.map((l) => l.id) } }, select: { teacherId: true, status: true } });
    expect(lessons.every((l) => l.teacherId === teacher.teacherId && l.status !== "CANCELLED")).toBe(true);
    const full = (await getTeacherJournal(teacher, groupId, disciplineId, { all: true }))!;
    expect(full.lessons.length).toBe(full.totalLessons);
    // столбцы — хронологически слева направо
    const dates = j.lessons.map((l) => `${l.date} ${l.start}`);
    expect([...dates].sort()).toEqual(dates);
    // у каждой пары «студент × занятие» есть клетка
    for (const s of j.students) expect(Object.keys(j.cells[s.id]!).length).toBe(j.lessons.length);
  });

  it("чужой журнал не открывается", async () => {
    expect(await getTeacherJournal(other, groupId, disciplineId)).toBeNull();
  });

  it("посещаемость: поставить, изменить, снять — одна отметка на занятие", async () => {
    const j = (await getTeacherJournal(teacher, groupId, disciplineId))!;
    const student = j.students[0]!;
    const lesson = j.lessons.at(-1)!;
    const oid = (await db.lesson.findUniqueOrThrow({ where: { id: lesson.id }, select: { oid: true } })).oid;
    const before = await db.attendance.findUnique({ where: { studentId_lessonOid: { studentId: student.id, lessonOid: oid } } });
    touched.push({ studentId: student.id, lessonOid: oid, before: before?.status ?? null });

    for (const status of ["ABSENT", "LATE", "PRESENT"] as const) {
      expect(await setTeacherAttendance(teacher, { studentId: student.id, lessonId: lesson.id, status })).toEqual({ ok: true });
      const rows = await db.attendance.findMany({ where: { studentId: student.id, lessonOid: oid } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe(status);
      expect(rows[0]!.teacherId).toBe(teacher.teacherId);
    }
    expect((await getTeacherJournal(teacher, groupId, disciplineId))!.cells[student.id]![lesson.id]!.attendance).toBe("PRESENT");
    expect(await setTeacherAttendance(teacher, { studentId: student.id, lessonId: lesson.id, status: null })).toEqual({ ok: true });
    expect(await db.attendance.count({ where: { studentId: student.id, lessonOid: oid } })).toBe(0);
  });

  it("другой преподаватель не может отметить посещаемость на чужом занятии", async () => {
    const j = (await getTeacherJournal(teacher, groupId, disciplineId))!;
    const r = await setTeacherAttendance(other, { studentId: j.students[0]!.id, lessonId: j.lessons[0]!.id, status: "ABSENT" });
    expect(r.ok).toBe(false);
  });

  it("возврат после сохранения — только на страницу журнала", () => {
    expect(safeJournalBack("/teacher/marks?group=a&discipline=b&cell=x.y")).toBe("/teacher/marks?group=a&discipline=b&cell=x.y");
    expect(safeJournalBack("https://evil.example/")).toBe("/teacher/marks");
    expect(safeJournalBack("//evil.example")).toBe("/teacher/marks");
    expect(safeJournalBack("/staff")).toBe("/teacher/marks");
  });

  it("сообщение на странице — только из справочника по коду, не текст из адреса", () => {
    expect(journalMessage("mark")).toMatch(/оценку/);
    expect(journalMessage("Ваш пароль устарел, зайдите на evil.example")).toBeNull();
    expect(journalMessage(undefined)).toBeNull();
  });
});

describe("Деканат: таблица и форма поиска", () => {
  let staff: StaffContext;
  let otherStaff: StaffContext;
  beforeAll(async () => {
    const st = await db.staff.findFirstOrThrow({ orderBy: { faculty: { sortOrder: "asc" } } });
    staff = { userId: st.userId, staffId: st.id, facultyId: st.facultyId } as StaffContext;
    const o = await db.staff.findFirstOrThrow({ where: { facultyId: { not: st.facultyId } } });
    otherStaff = { userId: o.userId, staffId: o.id, facultyId: o.facultyId } as StaffContext;
  });

  it("цепочка курс → группа → студент → предмет → дата: каждый список — по выбору в предыдущем", async () => {
    const courses = await listFacultyCourses(staff);
    expect(courses.length).toBeGreaterThan(0);
    const course = courses[0]!.course;
    const groups = await listFacultyGroupOptions(staff, course);
    expect(groups.length).toBeGreaterThan(0);
    const dbGroups = await db.group.findMany({ where: { id: { in: groups.map((g) => g.id) } }, select: { course: true, facultyId: true } });
    expect(dbGroups.every((g) => g.course === course && g.facultyId === staff.facultyId)).toBe(true);

    const students = await listGroupStudentOptions(staff, groups[0]!.id);
    expect(students.length).toBeGreaterThan(0);
    const dbStudents = await db.student.findMany({
      where: { id: { in: students.map((x) => x.id) } },
      select: { facultyId: true, academicGroupId: true, languageGroups: { select: { groupId: true } } },
    });
    expect(
      dbStudents.every(
        (x) => x.facultyId === staff.facultyId && (x.academicGroupId === groups[0]!.id || x.languageGroups.some((g) => g.groupId === groups[0]!.id)),
      ),
    ).toBe(true);

    const disciplines = await listGradableDisciplines(staff, students[0]!.id);
    expect(disciplines.length).toBeGreaterThan(0);
    const lessons = await listGradableLessons(staff, students[0]!.id, disciplines[0]!.id);
    expect(lessons.length).toBeGreaterThan(0);
    const dbLessons = await db.lesson.findMany({ where: { id: { in: lessons.map((l) => l.id) } }, select: { disciplineId: true } });
    expect(dbLessons.every((l) => l.disciplineId === disciplines[0]!.id)).toBe(true);
  });

  it("чужой факультет: пустые списки и нет журнала", async () => {
    const course = (await listFacultyCourses(staff))[0]!.course;
    const group = (await listFacultyGroupOptions(staff, course))[0]!;
    expect(await listGroupStudentOptions(otherStaff, group.id)).toEqual([]);
    expect(await listGroupDisciplineOptions(otherStaff, group.id)).toEqual([]);
    const discipline = (await listGroupDisciplineOptions(staff, group.id))[0]!;
    expect(await getJournal(otherStaff, group.id, discipline.id)).toBeNull();
  });

  it("таблица деканата: все занятия группы по предмету, хронологически; студенты только своего факультета", async () => {
    const course = (await listFacultyCourses(staff))[0]!.course;
    const group = (await listFacultyGroupOptions(staff, course))[0]!;
    const discipline = (await listGroupDisciplineOptions(staff, group.id))[0]!;
    const j = (await getJournal(staff, group.id, discipline.id, { all: true }))!;
    expect(j.lessons.length).toBeGreaterThan(0);
    const dates = j.lessons.map((l) => `${l.date} ${l.start}`);
    expect([...dates].sort()).toEqual(dates);
    const facultyIds = await db.student.findMany({ where: { id: { in: j.students.map((x) => x.id) } }, select: { facultyId: true } });
    expect(facultyIds.every((f) => f.facultyId === staff.facultyId)).toBe(true);
  });
});
