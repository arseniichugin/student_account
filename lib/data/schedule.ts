import "server-only";
import { db } from "@/lib/db";
import type { StudentContext, UserContext } from "@/lib/auth/guards";
import type { LessonStatus, Prisma } from "@/lib/generated/prisma/client";
import { addDaysIso, daysBetweenIso, dbDateToIso, isIsoDate, isoDateToDb, moscowToday } from "@/lib/moscow-time";
import { safeExternalUrl } from "@/lib/safe-url";

// Слой данных расписания.
// ПРАВИЛА:
//  — личное расписание: группы студента берутся ТОЛЬКО по ctx.studentId (из сессии),
//    никогда из параметров; занятия чужих языковых групп не попадают;
//  — расписание группы/преподавателя и поиск — открытые данные вуза, но только для вошедших
//    (requireUser); студентов поиск не возвращает;
//  — функции возвращают плоские сериализуемые объекты: даты «YYYY-MM-DD», время «HH:MM» (по Москве).

export { moscowToday };

/** Максимальная длина запрошенного периода — чуть больше семестра. */
export const MAX_RANGE_DAYS = 190;

export type ScheduleLessonStatus = "normal" | "moved" | "cancelled" | "replaced";

export type ScheduleLesson = {
  id: string;
  /** «2026-11-09» */
  date: string;
  /** «09:00» */
  start: string;
  /** «10:20» */
  end: string;
  /** Номер пары (по сетке вуза) */
  pairStart: number | null;
  pairEnd: number | null;
  discipline: string;
  /** Вид работы: «Лекция», «Практическое занятие», «Семинар», «Экзамен»… */
  kind: string;
  status: ScheduleLessonStatus;
  /** Номер аудитории («4144», «Манеж-1»); null — онлайн или без аудитории */
  room: string | null;
  roomFloor: number | null;
  /** Название корпуса: «Главный корпус» */
  building: string | null;
  buildingAddress: string | null;
  /** Нет аудитории, но есть ссылка */
  isOnline: boolean;
  teacher: { id: string; shortName: string; fullName: string; rank: string | null; email: string | null } | null;
  /** Все группы занятия (у лекции потока — несколько) */
  groups: { id: string; name: string }[];
  stream: string | null;
  /** Причина изменения: «Отмена: болезнь преподавателя» */
  note: string | null;
  /** Ссылка на онлайн-занятие (только http/https — проверяется при импорте) */
  url: string | null;
  urlDescription: string | null;
};

export type FacultyOption = { id: string; code: string; name: string };

export type ScheduleGroupInfo = {
  id: string;
  name: string;
  kind: "academic" | "language" | "other";
  course: number | null;
  faculty: FacultyOption | null;
  /** Для языковой группы — академическая группа */
  parent: { id: string; name: string } | null;
  /** Для академической группы — её языковые группы */
  subgroups: { id: string; name: string }[];
};

export type ScheduleTeacherInfo = {
  id: string;
  shortName: string;
  fullName: string;
  rank: string | null;
  email: string | null;
};

export type ScheduleTarget =
  | ({ type: "group" } & Omit<ScheduleGroupInfo, "parent" | "subgroups">)
  | ({ type: "teacher" } & Omit<ScheduleTeacherInfo, "email">);

export class ScheduleRangeError extends Error {}

// ─── Помощники ──────────────────────────────────────────────────────

/** Проверяет период; при ошибке — ScheduleRangeError (страница должна проверить параметры заранее). */
function checkRange(from: string, to: string) {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new ScheduleRangeError("Дата должна быть в формате YYYY-MM-DD");
  const days = daysBetweenIso(from, to);
  if (days < 0) throw new ScheduleRangeError("Начало периода позже конца");
  if (days > MAX_RANGE_DAYS) throw new ScheduleRangeError(`Период длиннее ${MAX_RANGE_DAYS} дней`);
  return { gte: isoDateToDb(from), lte: isoDateToDb(to) };
}

/** Неделя (пн–вс), в которую попадает дата. */
export function weekRange(date: string = moscowToday()): { from: string; to: string } {
  if (!isIsoDate(date)) throw new ScheduleRangeError("Дата должна быть в формате YYYY-MM-DD");
  const weekday = (isoDateToDb(date).getUTCDay() + 6) % 7; // 0 — понедельник
  const from = addDaysIso(date, -weekday);
  return { from, to: addDaysIso(from, 6) };
}

const STATUS: Record<LessonStatus, ScheduleLessonStatus> = {
  NORMAL: "normal",
  MOVED: "moved",
  CANCELLED: "cancelled",
  REPLACED: "replaced",
};

const lessonSelect = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  pairStart: true,
  pairEnd: true,
  kind: true,
  status: true,
  stream: true,
  note: true,
  url: true,
  urlDescription: true,
  discipline: { select: { name: true } },
  teacher: { select: { id: true, shortName: true, fullName: true, rank: true, email: true } },
  room: { select: { number: true, floor: true } },
  building: { select: { name: true, address: true } },
  groups: { select: { group: { select: { id: true, name: true } } } },
} as const;

const lessonOrder = [{ date: "asc" }, { startTime: "asc" }, { endTime: "asc" }] as const;

type LessonRow = Awaited<ReturnType<typeof findLessons>>[number];

function findLessons(where: Prisma.LessonWhereInput) {
  return db.lesson.findMany({ where, orderBy: [...lessonOrder], select: lessonSelect });
}

function toLesson(l: LessonRow): ScheduleLesson {
  return {
    id: l.id,
    date: dbDateToIso(l.date),
    start: l.startTime,
    end: l.endTime,
    pairStart: l.pairStart,
    pairEnd: l.pairEnd,
    discipline: l.discipline.name,
    kind: l.kind,
    status: STATUS[l.status],
    room: l.room?.number ?? null,
    roomFloor: l.room?.floor ?? null,
    building: l.building?.name ?? null,
    buildingAddress: l.building?.address ?? null,
    isOnline: !l.room && !!safeExternalUrl(l.url),
    teacher: l.teacher,
    groups: l.groups.map((g) => g.group).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    stream: l.stream,
    note: l.note,
    url: safeExternalUrl(l.url), // только http(s): в href не попадёт javascript:
    urlDescription: l.urlDescription,
  };
}

const groupKind = { ACADEMIC: "academic", LANGUAGE: "language", OTHER: "other" } as const;
const facultySelect = { select: { id: true, code: true, name: true } } as const;

// ─── Личное расписание студента ─────────────────────────────────────

/** Группы студента: академическая + языковые. Только по id из сессии. */
async function myGroupIds(ctx: StudentContext): Promise<string[]> {
  const s = await db.student.findUniqueOrThrow({
    where: { id: ctx.studentId },
    select: { academicGroupId: true, languageGroups: { select: { groupId: true } } },
  });
  return [s.academicGroupId, ...s.languageGroups.map((g) => g.groupId)];
}

/** Занятия студента за период (включительно). Даты — «YYYY-MM-DD» по Москве. */
export async function getMyScheduleForRange(ctx: StudentContext, from: string, to: string): Promise<ScheduleLesson[]> {
  const date = checkRange(from, to);
  const groupIds = await myGroupIds(ctx);
  const rows = await findLessons({ groups: { some: { groupId: { in: groupIds }, date } } });
  return rows.map(toLesson);
}

/** Занятия студента за один день; по умолчанию — «сегодня» по Москве. */
export function getMyScheduleForDate(ctx: StudentContext, date: string = moscowToday()): Promise<ScheduleLesson[]> {
  return getMyScheduleForRange(ctx, date, date);
}

// ─── Открытое расписание (любой вошедший) ──────────────────────────

/** Факультеты для фильтра поиска; isMine — факультет вошедшего (удобно выбрать по умолчанию). */
export async function listFaculties(ctx: UserContext): Promise<(FacultyOption & { isMine: boolean })[]> {
  const rows = await db.faculty.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true },
  });
  return rows.map((f) => ({ ...f, isMine: f.id === ctx.facultyId }));
}

/**
 * Prisma передаёт строку `contains` в ILIKE '%…%' как есть: «%» и «_» в запросе стали бы
 * шаблоном («%» — «всё подряд»). Экранируем их и сам «\» — escape-символ LIKE в PostgreSQL по умолчанию.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Поиск по группам и преподавателям (без студентов!). Регистр не важен.
 * facultyId — только группы этого факультета и преподаватели, у которых есть занятия с ними.
 */
export async function searchScheduleTargets(
  _ctx: UserContext,
  query: string,
  options: { facultyId?: string | null; limit?: number } = {},
): Promise<ScheduleTarget[]> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 64);
  if (q === "") return [];
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const facultyId = options.facultyId || undefined;
  const contains = { contains: escapeLike(q), mode: "insensitive" as const };

  const [groups, teachers] = await Promise.all([
    db.group.findMany({
      where: { name: contains, ...(facultyId ? { facultyId } : {}) },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      take: limit,
      select: { id: true, name: true, kind: true, course: true, faculty: facultySelect },
    }),
    db.teacher.findMany({
      where: {
        OR: [{ shortName: contains }, { fullName: contains }],
        ...(facultyId ? { lessons: { some: { groups: { some: { group: { facultyId } } } } } } : {}),
      },
      orderBy: { shortName: "asc" },
      take: limit,
      select: { id: true, shortName: true, fullName: true, rank: true },
    }),
  ]);

  return [
    ...groups.map((g) => ({ type: "group" as const, ...g, kind: groupKind[g.kind] })),
    ...teachers.map((t) => ({ type: "teacher" as const, ...t })),
  ].slice(0, limit);
}

/**
 * Расписание группы за период. includeSubgroups — для академической группы добавить
 * занятия её языковых групп. Неизвестная группа → null (страница показывает «Не найдено»).
 */
export async function getGroupSchedule(
  _ctx: UserContext,
  groupId: string,
  from: string,
  to: string,
  options: { includeSubgroups?: boolean } = {},
): Promise<{ group: ScheduleGroupInfo; lessons: ScheduleLesson[] } | null> {
  const date = checkRange(from, to);
  if (groupId.length === 0 || groupId.length > 64) return null;
  const g = await db.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      kind: true,
      course: true,
      faculty: facultySelect,
      parent: { select: { id: true, name: true } },
      children: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  if (!g) return null;
  const ids = [g.id, ...(options.includeSubgroups ? g.children.map((c) => c.id) : [])];
  const rows = await findLessons({ groups: { some: { groupId: { in: ids }, date } } });
  return {
    group: {
      id: g.id,
      name: g.name,
      kind: groupKind[g.kind],
      course: g.course,
      faculty: g.faculty,
      parent: g.parent,
      subgroups: g.children,
    },
    lessons: rows.map(toLesson),
  };
}

/**
 * Академические группы факультета по курсам — для экрана «Расписание» без выбранной цели
 * (сотрудник видит группы своего факультета). Неизвестный факультет → пустой список.
 */
export async function listFacultyGroups(
  _ctx: UserContext,
  facultyId: string,
): Promise<{ id: string; name: string; course: number | null }[]> {
  if (facultyId.length === 0 || facultyId.length > 64) return [];
  return db.group.findMany({
    where: { facultyId, kind: "ACADEMIC" },
    orderBy: [{ course: "asc" }, { name: "asc" }],
    select: { id: true, name: true, course: true },
  });
}

/** Расписание преподавателя за период. Неизвестный преподаватель → null. */
export async function getTeacherSchedule(
  _ctx: UserContext,
  teacherId: string,
  from: string,
  to: string,
): Promise<{ teacher: ScheduleTeacherInfo; lessons: ScheduleLesson[] } | null> {
  const date = checkRange(from, to);
  if (teacherId.length === 0 || teacherId.length > 64) return null;
  const teacher = await db.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, shortName: true, fullName: true, rank: true, email: true },
  });
  if (!teacher) return null;
  const rows = await findLessons({ teacherId, date });
  return { teacher, lessons: rows.map(toLesson) };
}
