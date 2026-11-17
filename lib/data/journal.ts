import "server-only";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import type { TeacherContext } from "@/lib/auth/guards";
import type { AttendanceStatus } from "@/lib/generated/prisma/client";
import { gradableLessonsWhere, gradableStudent } from "@/lib/data/marks";
import { teacherGroupIds } from "@/lib/data/notifications";
import { dbDateToIso, moscowToday } from "@/lib/moscow-time";

// Журнал преподавателя (/teacher/marks): таблица «студенты × занятия» по одной паре (группа, предмет).
// ПРАВИЛА (как у оценок, lib/data/marks.ts):
//   — пары «группа + предмет» — только из ЕГО занятий (lesson.teacherId = ctx.teacherId);
//   — столбцы — только его начавшиеся неотменённые занятия у этой группы;
//   — строки — студенты этой группы (академической или языковой);
//   — отметить посещаемость можно только своему студенту за своё начавшееся занятие.
// Чужая группа/предмет → null (страница показывает «не найдено»).

export const MAX_ATTENDANCE_PER_HOUR = 600;
export const MAX_ATTENDANCE_PER_HOUR_DEMO = 200;
export function attendancePerHourLimit(): number {
  return isDemoMode() ? MAX_ATTENDANCE_PER_HOUR_DEMO : MAX_ATTENDANCE_PER_HOUR;
}

/** По умолчанию показываем последние занятия — чтобы таблица помещалась; ?all=1 — все. */
export const JOURNAL_RECENT_LESSONS = 8;

export type TeacherClass = {
  groupId: string;
  groupName: string;
  disciplineId: string;
  disciplineName: string;
  /** Сколько его занятий у группы по предмету уже прошло */
  pastLessons: number;
};

/** Пары «группа + предмет», которые ведёт преподаватель (для выбора журнала). */
export async function listTeacherClasses(ctx: TeacherContext, today: string = moscowToday()): Promise<TeacherClass[]> {
  const rows = await db.lessonGroup.findMany({
    where: { lesson: { teacherId: ctx.teacherId } },
    select: {
      groupId: true,
      group: { select: { name: true } },
      lesson: { select: { disciplineId: true, discipline: { select: { name: true } }, date: true, status: true } },
    },
  });
  const byKey = new Map<string, TeacherClass>();
  for (const r of rows) {
    const key = `${r.groupId}:${r.lesson.disciplineId}`;
    const c = byKey.get(key) ?? {
      groupId: r.groupId,
      groupName: r.group.name,
      disciplineId: r.lesson.disciplineId,
      disciplineName: r.lesson.discipline.name,
      pastLessons: 0,
    };
    if (dbDateToIso(r.lesson.date) <= today && r.lesson.status !== "CANCELLED") c.pastLessons++;
    byKey.set(key, c);
  }
  return [...byKey.values()].sort(
    (a, b) => a.groupName.localeCompare(b.groupName, "ru") || a.disciplineName.localeCompare(b.disciplineName, "ru"),
  );
}

export type JournalLesson = { id: string; date: string; start: string; kind: string };
export type JournalMark = { id: string; value: number; own: boolean };
export type JournalCell = { marks: JournalMark[]; attendance: AttendanceStatus | null };
export type JournalStudent = { id: string; name: string; shortName: string };

export type Journal = {
  groupId: string;
  groupName: string;
  disciplineId: string;
  disciplineName: string;
  lessons: JournalLesson[];
  /** Сколько всего прошедших занятий (если показаны не все) */
  totalLessons: number;
  students: JournalStudent[];
  /** cells[studentId][lessonId] */
  cells: Record<string, Record<string, JournalCell>>;
};

const fio = (s: { lastName: string; firstName: string; middleName: string | null }) =>
  [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ");
const shortFio = (s: { lastName: string; firstName: string; middleName: string | null }) =>
  `${s.lastName} ${s.firstName[0]}.${s.middleName ? ` ${s.middleName[0]}.` : ""}`;

/** Журнал по паре «группа + предмет»; null — преподаватель такую пару не ведёт. */
export async function getTeacherJournal(
  ctx: TeacherContext,
  groupId: string,
  disciplineId: string,
  opts: { all?: boolean; today?: string } = {},
): Promise<Journal | null> {
  const today = opts.today ?? moscowToday();
  const [group, discipline] = await Promise.all([
    db.group.findFirst({
      where: { id: groupId, lessons: { some: { lesson: { teacherId: ctx.teacherId, disciplineId } } } },
      select: { id: true, name: true },
    }),
    db.discipline.findUnique({ where: { id: disciplineId }, select: { id: true, name: true } }),
  ]);
  if (!group || !discipline) return null;

  const allLessons = await db.lesson.findMany({
    where: { disciplineId, ...gradableLessonsWhere(ctx, [group.id], today) },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, date: true, startTime: true, kind: true },
  });
  // Новые занятия — первыми (слева): на телефоне сразу видно сегодняшнее
  const shown = (opts.all ? allLessons : allLessons.slice(-JOURNAL_RECENT_LESSONS)).reverse();

  const students = await db.student.findMany({
    where: { OR: [{ academicGroupId: group.id }, { languageGroups: { some: { groupId: group.id } } }] },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true },
  });

  const lessonIds = shown.map((l) => l.id);
  const studentIds = students.map((s) => s.id);
  const [marks, attendance] = await Promise.all([
    db.mark.findMany({
      where: { lessonId: { in: lessonIds }, studentId: { in: studentIds } },
      orderBy: { createdAt: "asc" },
      select: { id: true, value: true, studentId: true, lessonId: true, teacherId: true },
    }),
    db.attendance.findMany({
      where: { lessonId: { in: lessonIds }, studentId: { in: studentIds } },
      select: { studentId: true, lessonId: true, status: true },
    }),
  ]);

  const cells: Journal["cells"] = {};
  for (const s of students) {
    cells[s.id] = {};
    for (const l of shown) cells[s.id]![l.id] = { marks: [], attendance: null };
  }
  for (const m of marks) {
    cells[m.studentId]?.[m.lessonId!]?.marks.push({ id: m.id, value: m.value, own: m.teacherId === ctx.teacherId });
  }
  for (const a of attendance) {
    const cell = cells[a.studentId]?.[a.lessonId!];
    if (cell) cell.attendance = a.status;
  }

  return {
    groupId: group.id,
    groupName: group.name,
    disciplineId: discipline.id,
    disciplineName: discipline.name,
    lessons: shown.map((l) => ({ id: l.id, date: dbDateToIso(l.date), start: l.startTime, kind: l.kind })),
    totalLessons: allLessons.length,
    students: students.map((s) => ({ id: s.id, name: fio(s), shortName: shortFio(s) })),
    cells,
  };
}

/** Есть ли у преподавателя хоть одна группа (для пустого состояния). */
export async function teacherHasGroups(ctx: TeacherContext): Promise<boolean> {
  return (await teacherGroupIds(ctx.teacherId)).length > 0;
}

export type SetAttendanceResult = { ok: true } | { ok: false; error: string };

/**
 * Отметить посещаемость (или снять отметку, status = null). Только своему студенту за своё начавшееся
 * неотменённое занятие, в группе которого студент учится. Одна отметка на студента и занятие.
 */
export async function setTeacherAttendance(
  ctx: TeacherContext,
  input: { studentId: string; lessonId: string; status: AttendanceStatus | null },
  today: string = moscowToday(),
): Promise<SetAttendanceResult> {
  const student = await gradableStudent(ctx, input.studentId);
  if (!student) return { ok: false, error: "Студент не найден в ваших группах" };
  const lesson = await db.lesson.findFirst({
    where: { id: input.lessonId, ...gradableLessonsWhere(ctx, student.groupIds, today) },
    select: { id: true, oid: true, date: true },
  });
  if (!lesson) return { ok: false, error: "Такого занятия у студента не было (или оно ещё не началось)" };

  // Защита общего демо-аккаунта: не больше N изменений посещаемости в час от преподавателя
  const lastHour = await db.attendance.count({
    where: { teacherId: ctx.teacherId, updatedAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  const limit = attendancePerHourLimit();
  if (lastHour >= limit) return { ok: false, error: `Не больше ${limit} отметок посещаемости в час` };

  if (input.status === null) {
    await db.attendance.deleteMany({ where: { studentId: student.id, lessonOid: lesson.oid } });
    return { ok: true };
  }
  await db.attendance.upsert({
    where: { studentId_lessonOid: { studentId: student.id, lessonOid: lesson.oid } },
    create: {
      studentId: student.id,
      lessonId: lesson.id,
      lessonOid: lesson.oid,
      date: lesson.date,
      status: input.status,
      teacherId: ctx.teacherId,
    },
    update: { status: input.status, lessonId: lesson.id, teacherId: ctx.teacherId },
  });
  return { ok: true };
}
