import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { StaffContext, StudentContext, TeacherContext } from "@/lib/auth/guards";

// cache() — один запрос к базе на HTTP-запрос: профиль нужен и оболочке (layout), и странице.
// Ключ — объект контекста; requireStudent/requireStaff/requireTeacher тоже в cache(), поэтому он один и тот же.

/** Профиль текущего студента. id берётся только из контекста сессии. */
export const getMyStudentProfile = cache(async (ctx: StudentContext) => {
  const s = await db.student.findUniqueOrThrow({
    where: { id: ctx.studentId },
    select: {
      lastName: true,
      firstName: true,
      middleName: true,
      recordBookNo: true,
      email: true,
      course: true,
      user: { select: { login: true } },
      faculty: { select: { name: true, code: true } },
      program: { select: { name: true } },
      academicGroup: { select: { id: true, name: true } },
      languageGroups: { orderBy: { position: "asc" }, select: { group: { select: { name: true } } } },
    },
  });
  const { languageGroups, ...rest } = s;
  return { ...rest, languageGroups: languageGroups.map((g) => g.group.name) };
});

export const getMyStaffProfile = cache(async (ctx: StaffContext) => {
  return db.staff.findUniqueOrThrow({
    where: { id: ctx.staffId },
    select: {
      fullName: true,
      position: true,
      user: { select: { login: true } },
      faculty: { select: { name: true, code: true } },
    },
  });
});

/**
 * Профиль текущего преподавателя: для оболочки (имя, должность) и страницы профиля.
 * firstName/lastName — разбор fullName («Фамилия Имя Отчество»), в базе отдельно не хранятся.
 */
export const getMyTeacherProfile = cache(async (ctx: TeacherContext) => {
  const t = await db.teacher.findUniqueOrThrow({
    where: { id: ctx.teacherId },
    select: {
      id: true,
      fullName: true,
      shortName: true,
      rank: true,
      email: true,
      user: { select: { login: true } },
      _count: { select: { assignments: true } },
    },
  });
  const [lastName = "", firstName = "", middleName = ""] = t.fullName.split(/\s+/);
  return {
    id: t.id,
    fullName: t.fullName,
    shortName: t.shortName,
    lastName,
    firstName,
    middleName: middleName || null,
    /** Должность из расписания: «ст. преподаватель», «доцент»; может отсутствовать */
    rank: t.rank,
    email: t.email,
    login: t.user?.login ?? "",
    /** Сколько пар «дисциплина × группа» в журнале */
    assignmentCount: t._count.assignments,
  };
});
