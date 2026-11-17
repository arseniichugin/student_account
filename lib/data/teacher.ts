import "server-only";
import { db } from "@/lib/db";
import type { TeacherContext } from "@/lib/auth/guards";
import { teacherGroupIds } from "@/lib/data/notifications";

// Профиль преподавателя — только по ctx.teacherId из сессии.

export type TeacherProfile = {
  id: string;
  shortName: string;
  fullName: string;
  rank: string | null;
  email: string | null;
  login: string;
  /** Группы, у которых он ведёт занятия (по расписанию) */
  groups: { id: string; name: string }[];
  /** Дисциплины, которые он ведёт */
  disciplines: string[];
};

export async function getMyTeacherProfile(ctx: TeacherContext): Promise<TeacherProfile> {
  const [t, groupIds, disciplines] = await Promise.all([
    db.teacher.findUniqueOrThrow({
      where: { id: ctx.teacherId },
      select: { id: true, shortName: true, fullName: true, rank: true, email: true, user: { select: { login: true } } },
    }),
    teacherGroupIds(ctx.teacherId),
    db.discipline.findMany({
      where: { lessons: { some: { teacherId: ctx.teacherId } } },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);
  const groups = await db.group.findMany({ where: { id: { in: groupIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return {
    id: t.id,
    shortName: t.shortName,
    fullName: t.fullName,
    rank: t.rank,
    email: t.email,
    login: t.user?.login ?? "",
    groups,
    disciplines: disciplines.map((d) => d.name),
  };
}
