import "server-only";
import { db } from "@/lib/db";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";

/** Профиль текущего студента. id берётся только из контекста сессии. */
export async function getMyStudentProfile(ctx: StudentContext) {
  return db.student.findUniqueOrThrow({
    where: { id: ctx.studentId },
    select: {
      lastName: true,
      firstName: true,
      middleName: true,
      recordBookNo: true,
      user: { select: { login: true } },
      group: {
        select: {
          name: true,
          course: true,
          program: {
            select: {
              code: true,
              name: true,
              faculty: { select: { name: true, short: true } },
            },
          },
        },
      },
    },
  });
}

export async function getMyStaffProfile(ctx: StaffContext) {
  return db.staff.findUniqueOrThrow({
    where: { id: ctx.staffId },
    select: {
      fullName: true,
      position: true,
      user: { select: { login: true } },
      faculty: { select: { name: true, short: true } },
    },
  });
}
