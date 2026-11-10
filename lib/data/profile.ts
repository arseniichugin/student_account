import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";

// cache() — один запрос к базе на HTTP-запрос: профиль нужен и оболочке (layout), и странице.
// Ключ — объект контекста; requireStudent/requireStaff тоже в cache(), поэтому он один и тот же.

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
