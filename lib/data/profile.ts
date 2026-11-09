import "server-only";
import { db } from "@/lib/db";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";

/** Профиль текущего студента. id берётся только из контекста сессии. */
export async function getMyStudentProfile(ctx: StudentContext) {
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
}

export async function getMyStaffProfile(ctx: StaffContext) {
  return db.staff.findUniqueOrThrow({
    where: { id: ctx.staffId },
    select: {
      fullName: true,
      position: true,
      user: { select: { login: true } },
      faculty: { select: { name: true, code: true } },
    },
  });
}
