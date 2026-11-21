import "server-only";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import type { RecipientContext, StaffContext, TeacherContext } from "@/lib/auth/guards";
import type { AnnouncementAudience, NotificationType, Prisma } from "@/lib/generated/prisma/client";
import type { StaffNotificationKind } from "@/lib/notifications/labels";
import { GROUP_SUGGEST_LIMIT } from "@/lib/validation/notifications";

// Слой данных событий (Announcement) и уведомлений (Notification).
// ПРАВИЛА:
//   получатель (студент, преподаватель) → только свои уведомления: where.userId = ctx.userId (из сессии)
//               и только уже «отправленные» (createdAt ≤ сейчас) — запланированные заранее не видны;
//   деканат   → события своего факультета (facultyId = ctx.facultyId). «Всем» — студенты факультета
//               и преподаватели, которые ведут занятия у его групп; курсу / группе — студенты;
//               «всем преподавателям» / «преподавателю …» — только преподаватели факультета;
//   преподаватель → только своим группам (у которых он ведёт занятия): всем сразу или одной.
// Чужая группа / чужой преподаватель / чужое событие → тот же ответ, что и несуществующие.

/** Защита от спама: событий в час на автора. */
export const MAX_ANNOUNCEMENTS_PER_HOUR = 20;
/** На публичном демо-стенде (DEMO_MODE=1) аккаунты общие — лимит строже. */
export const MAX_ANNOUNCEMENTS_PER_HOUR_DEMO = 5;

export function announcementsPerHourLimit(): number {
  return isDemoMode() ? MAX_ANNOUNCEMENTS_PER_HOUR_DEMO : MAX_ANNOUNCEMENTS_PER_HOUR;
}
/** Насколько вперёд можно запланировать отправку. */
export const MAX_SCHEDULE_AHEAD_DAYS = 180;
/** Отправка «в прошлое» с небольшим запасом считается отправкой «сейчас» (форма заполнялась пару минут). */
const PAST_TOLERANCE_MS = 10 * 60_000;

export type Audience =
  | { type: "faculty" }
  | { type: "course"; course: number }
  | { type: "group"; groupId: string }
  | { type: "allTeachers" }
  | { type: "teacher"; teacherId: string }
  | { type: "myGroups" };

/** Какие аудитории доступны каждой роли (проверяется и здесь, и в серверных действиях). */
export const STAFF_AUDIENCES = ["faculty", "course", "group", "allTeachers", "teacher"] as const;
export const TEACHER_AUDIENCES = ["myGroups", "group"] as const;

const AUDIENCE_DB: Record<Audience["type"], AnnouncementAudience> = {
  faculty: "FACULTY",
  course: "COURSE",
  group: "GROUP",
  allTeachers: "ALL_TEACHERS",
  teacher: "TEACHER",
  myGroups: "MY_GROUPS",
};

export type CreateAnnouncementInput = {
  kind: StaffNotificationKind;
  title: string;
  body: string;
  audience: Audience;
  /** null — отправить сейчас */
  sendAt: Date | null;
};

export type CreateAnnouncementResult =
  | { ok: true; id: string; recipients: number; publishedAt: Date; scheduled: boolean }
  | { ok: false; error: string };

const studentsOfGroups = (groupIds: string[]): Prisma.StudentWhereInput => ({
  OR: [{ academicGroupId: { in: groupIds } }, { languageGroups: { some: { groupId: { in: groupIds } } } }],
});

/** Преподаватели, которые ведут занятия у групп факультета (и у которых есть аккаунт). */
const facultyTeachersWhere = (facultyId: string): Prisma.TeacherWhereInput => ({
  userId: { not: null },
  lessons: { some: { groups: { some: { group: { facultyId } } } } },
});

/** Группы, у которых преподаватель ведёт занятия. */
export async function teacherGroupIds(teacherId: string): Promise<string[]> {
  const rows = await db.lessonGroup.findMany({
    where: { lesson: { teacherId } },
    distinct: ["groupId"],
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

type Resolved = { userIds: string[]; course?: number; groupId?: string; teacherId?: string } | { error: string };

/** Получатели события деканата. */
async function resolveStaffAudience(ctx: StaffContext, audience: Audience): Promise<Resolved> {
  const ids = async (where: Prisma.StudentWhereInput) =>
    (await db.student.findMany({ where: { facultyId: ctx.facultyId, ...where }, select: { userId: true } })).map((s) => s.userId);
  switch (audience.type) {
    case "faculty": {
      // «Всем» — студентам И преподавателям, которые ведут занятия у групп факультета
      const teachers = await db.teacher.findMany({ where: facultyTeachersWhere(ctx.facultyId), select: { userId: true } });
      return { userIds: [...(await ids({})), ...teachers.map((t) => t.userId!)] };
    }
    case "course":
      return { userIds: await ids({ course: audience.course }), course: audience.course };
    case "group": {
      const group = await db.group.findFirst({ where: { id: audience.groupId, facultyId: ctx.facultyId }, select: { id: true } });
      if (!group) return { error: "Группа не найдена на вашем факультете — выберите её из списка" };
      return { userIds: await ids(studentsOfGroups([group.id])), groupId: group.id };
    }
    case "allTeachers": {
      const teachers = await db.teacher.findMany({ where: facultyTeachersWhere(ctx.facultyId), select: { userId: true } });
      return { userIds: teachers.map((t) => t.userId!) };
    }
    case "teacher": {
      const t = await db.teacher.findFirst({
        where: { id: audience.teacherId, ...facultyTeachersWhere(ctx.facultyId) },
        select: { id: true, userId: true },
      });
      if (!t) return { error: "Преподаватель не найден среди ведущих занятия у вашего факультета — выберите из списка" };
      return { userIds: [t.userId!], teacherId: t.id };
    }
    default:
      return { error: "Деканат не может выбрать такую аудиторию" };
  }
}

/** Получатели события преподавателя — только студенты его групп. */
async function resolveTeacherAudience(ctx: TeacherContext, audience: Audience): Promise<Resolved> {
  const groups = await teacherGroupIds(ctx.teacherId);
  const ids = async (groupIds: string[]) =>
    (await db.student.findMany({ where: studentsOfGroups(groupIds), select: { userId: true } })).map((s) => s.userId);
  if (audience.type === "myGroups") return { userIds: await ids(groups) };
  if (audience.type === "group") {
    if (!groups.includes(audience.groupId)) return { error: "Это не ваша группа — выберите группу из списка" };
    return { userIds: await ids([audience.groupId]), groupId: audience.groupId };
  }
  return { error: "Преподаватель может писать только своим группам" };
}

/**
 * Создать событие и разослать уведомления. Получатели определяются в момент создания:
 * каждому — своя запись Notification с createdAt = время отправки
 * (у отложенного события получатель увидит её, когда это время наступит).
 */
async function createAnnouncement(
  author: { userId: string; facultyId: string | null },
  input: CreateAnnouncementInput,
  resolve: () => Promise<Resolved>,
  now: Date,
): Promise<CreateAnnouncementResult> {
  let publishedAt = input.sendAt ?? now;
  if (publishedAt.getTime() < now.getTime() - PAST_TOLERANCE_MS) {
    return { ok: false, error: "Время отправки уже прошло — выберите время в будущем или «Сейчас»" };
  }
  if (publishedAt.getTime() > now.getTime() + MAX_SCHEDULE_AHEAD_DAYS * 86_400_000) {
    return { ok: false, error: `Запланировать можно не дальше чем на ${MAX_SCHEDULE_AHEAD_DAYS} дней вперёд` };
  }
  if (publishedAt < now) publishedAt = now;

  const recent = await db.announcement.count({
    where: { authorId: author.userId, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
  });
  const limit = announcementsPerHourLimit();
  if (recent >= limit) return { ok: false, error: `Не больше ${limit} событий в час — попробуйте позже` };

  const resolved = await resolve();
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const userIds = [...new Set(resolved.userIds)];
  if (userIds.length === 0) return { ok: false, error: "В выбранной аудитории нет получателей" };

  const created = await db.$transaction(async (tx) => {
    const a = await tx.announcement.create({
      data: {
        authorId: author.userId, // автор и факультет — из сессии, не из формы
        facultyId: author.facultyId,
        kind: input.kind,
        audience: AUDIENCE_DB[input.audience.type],
        title: input.title,
        body: input.body,
        course: resolved.course ?? null,
        groupId: resolved.groupId ?? null,
        teacherId: resolved.teacherId ?? null,
        publishedAt,
        createdAt: now,
      },
      select: { id: true },
    });
    await tx.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.kind,
        title: input.title,
        body: input.body,
        createdAt: publishedAt,
        announcementId: a.id,
      })),
    });
    return a;
  });

  return { ok: true, id: created.id, recipients: userIds.length, publishedAt, scheduled: publishedAt > now };
}

// ─── Деканат ────────────────────────────────────────────────────────

export function createFacultyAnnouncement(
  ctx: StaffContext,
  input: CreateAnnouncementInput,
  now: Date = new Date(),
): Promise<CreateAnnouncementResult> {
  return createAnnouncement({ userId: ctx.userId, facultyId: ctx.facultyId }, input, () => resolveStaffAudience(ctx, input.audience), now);
}

// ─── Преподаватель ──────────────────────────────────────────────────

/** Событие преподавателя своим группам. facultyId не ставится: деканаты эти события не видят и не отменяют. */
export function createTeacherAnnouncement(
  ctx: TeacherContext,
  input: CreateAnnouncementInput,
  now: Date = new Date(),
): Promise<CreateAnnouncementResult> {
  return createAnnouncement({ userId: ctx.userId, facultyId: null }, input, () => resolveTeacherAudience(ctx, input.audience), now);
}

// ─── Списки отправленного ───────────────────────────────────────────

export type SentAnnouncement = {
  id: string;
  kind: NotificationType;
  title: string;
  body: string;
  /** «Всем студентам факультета», «2 курс», «Группа 1-ГР-1», «Всем преподавателям», «Преподаватель …» */
  audience: string;
  author: string;
  publishedAt: Date;
  scheduled: boolean;
  recipients: number;
  read: number;
};
/** Прежнее имя типа (кабинет деканата). */
export type FacultyAnnouncement = SentAnnouncement;

const AUDIENCE_TEXT: Record<AnnouncementAudience, string> = {
  FACULTY: "Всем: студентам и преподавателям факультета",
  COURSE: "Курс",
  GROUP: "Группа",
  ALL_TEACHERS: "Всем преподавателям",
  TEACHER: "Преподаватель",
  MY_GROUPS: "Всем моим группам",
};

const sentSelect = {
  id: true,
  kind: true,
  title: true,
  body: true,
  audience: true,
  course: true,
  publishedAt: true,
  group: { select: { name: true } },
  teacher: { select: { shortName: true } },
  author: { select: { login: true, staff: { select: { fullName: true } }, teacher: { select: { shortName: true } } } },
  _count: { select: { notifications: true } },
} as const;

async function listSent(where: Prisma.AnnouncementWhereInput, now: Date): Promise<SentAnnouncement[]> {
  const [scheduled, sent] = await Promise.all([
    db.announcement.findMany({ where: { ...where, publishedAt: { gt: now } }, orderBy: { publishedAt: "asc" }, take: 50, select: sentSelect }),
    db.announcement.findMany({ where: { ...where, publishedAt: { lte: now } }, orderBy: { publishedAt: "desc" }, take: 30, select: sentSelect }),
  ]);
  const rows = [...scheduled, ...sent];
  // Сколько получателей прочитали — одним запросом
  const readCounts = await db.notification.groupBy({
    by: ["announcementId"],
    where: { announcementId: { in: rows.map((r) => r.id) }, readAt: { not: null } },
    _count: { _all: true },
  });
  const read = new Map(readCounts.map((r) => [r.announcementId, r._count._all]));
  return rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    body: a.body,
    audience:
      a.audience === "GROUP" && a.group
        ? `Группа ${a.group.name}`
        : a.audience === "COURSE" && a.course
          ? `${a.course} курс`
          : a.audience === "TEACHER" && a.teacher
            ? `Преподаватель ${a.teacher.shortName}`
            : AUDIENCE_TEXT[a.audience],
    author: a.author.staff?.fullName ?? a.author.teacher?.shortName ?? a.author.login,
    publishedAt: a.publishedAt,
    scheduled: a.publishedAt > now,
    recipients: a._count.notifications,
    read: read.get(a.id) ?? 0,
  }));
}

/** События деканата факультета (авторы — сотрудники): сначала запланированные, потом отправленные. */
export function listFacultyAnnouncements(ctx: StaffContext, now: Date = new Date()): Promise<SentAnnouncement[]> {
  return listSent({ facultyId: ctx.facultyId, author: { role: "STAFF" } }, now);
}

/** События, которые отправил сам преподаватель. */
export function listTeacherAnnouncements(ctx: TeacherContext, now: Date = new Date()): Promise<SentAnnouncement[]> {
  return listSent({ authorId: ctx.userId }, now);
}

/** Отменить (удалить) событие деканата своего факультета вместе с уведомлениями. false — не найдено или чужое. */
export async function deleteFacultyAnnouncement(ctx: StaffContext, announcementId: string): Promise<boolean> {
  const { count } = await db.announcement.deleteMany({
    where: { id: announcementId, facultyId: ctx.facultyId, author: { role: "STAFF" } },
  });
  return count > 0;
}

/** Преподаватель отменяет только своё событие. */
export async function deleteTeacherAnnouncement(ctx: TeacherContext, announcementId: string): Promise<boolean> {
  const { count } = await db.announcement.deleteMany({ where: { id: announcementId, authorId: ctx.userId } });
  return count > 0;
}

// ─── Подсказки и справочники для формы ──────────────────────────────

export type Suggestion = { id: string; label: string; meta: string };
/** Прежнее имя типа. */
export type GroupSuggestion = Suggestion;

const GROUP_KIND = { ACADEMIC: "Группа", LANGUAGE: "Языковая группа", OTHER: "Группа" } as const;

async function suggestGroups(where: Prisma.GroupWhereInput, studentFilter: Prisma.StudentWhereInput, q: string): Promise<Suggestion[]> {
  const rows = await db.group.findMany({
    where: {
      ...where,
      name: q ? { contains: q, mode: "insensitive" } : undefined,
      OR: [{ students: { some: studentFilter } }, { members: { some: { student: studentFilter } } }],
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    take: GROUP_SUGGEST_LIMIT,
    select: {
      id: true,
      name: true,
      kind: true,
      course: true,
      _count: { select: { students: { where: studentFilter }, members: { where: { student: studentFilter } } } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    label: g.name,
    meta: [GROUP_KIND[g.kind], g.course ? `${g.course} курс` : null, `студентов: ${g._count.students + g._count.members}`]
      .filter(Boolean)
      .join(" · "),
  }));
}

/** Подсказки поля «Группа» деканата: группы своего факультета, в которых есть студенты. */
export function suggestFacultyGroups(ctx: StaffContext, q: string): Promise<Suggestion[]> {
  return suggestGroups({ facultyId: ctx.facultyId }, { facultyId: ctx.facultyId }, q);
}

/** Подсказки поля «Группа» преподавателя: только его группы. */
export async function suggestTeacherGroups(ctx: TeacherContext, q: string): Promise<Suggestion[]> {
  return suggestGroups({ id: { in: await teacherGroupIds(ctx.teacherId) } }, {}, q);
}

/** Подсказки поля «Преподаватель» деканата: ведущие занятия у групп факультета. */
export async function suggestFacultyTeachers(ctx: StaffContext, q: string): Promise<Suggestion[]> {
  const rows = await db.teacher.findMany({
    where: {
      ...facultyTeachersWhere(ctx.facultyId),
      ...(q ? { OR: [{ shortName: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { shortName: "asc" },
    take: GROUP_SUGGEST_LIMIT,
    select: { id: true, shortName: true, fullName: true, rank: true },
  });
  return rows.map((t) => ({ id: t.id, label: t.shortName, meta: [t.fullName, t.rank].filter(Boolean).join(" · ") }));
}

/** Курсы факультета и число студентов на каждом — для выбора «Курсу …». */
export async function listFacultyCourses(ctx: StaffContext): Promise<{ course: number; students: number }[]> {
  const rows = await db.student.groupBy({
    by: ["course"],
    where: { facultyId: ctx.facultyId },
    _count: { _all: true },
    orderBy: { course: "asc" },
  });
  return rows.map((r) => ({ course: r.course, students: r._count._all }));
}

/** Число студентов факультета — для подписи «Отправить всем (N)». */
export function countFacultyStudents(ctx: StaffContext): Promise<number> {
  return db.student.count({ where: { facultyId: ctx.facultyId } });
}

/** Число преподавателей факультета — для подписи «Всем преподавателям (N)». */
export function countFacultyTeachers(ctx: StaffContext): Promise<number> {
  return db.teacher.count({ where: facultyTeachersWhere(ctx.facultyId) });
}

/** Сколько студентов во всех группах преподавателя — для подписи «Всем моим группам (N)». */
export async function countTeacherStudents(ctx: TeacherContext): Promise<number> {
  return db.student.count({ where: studentsOfGroups(await teacherGroupIds(ctx.teacherId)) });
}

// ─── Получатель: студент или преподаватель ──────────────────────────

export type MyNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
  /** От кого: «Деканат», «Преподаватель Арсеньева П.Н.»; null — автоматическое (статус заявки) */
  from: string | null;
};

/** Уведомления, которые уже «пришли» (новые сверху). */
export async function listMyNotifications(ctx: RecipientContext, now: Date = new Date(), take = 50): Promise<MyNotification[]> {
  const rows = await db.notification.findMany({
    where: { userId: ctx.userId, createdAt: { lte: now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      link: true,
      createdAt: true,
      readAt: true,
      announcement: { select: { author: { select: { role: true, teacher: { select: { shortName: true } } } } } },
    },
  });
  return rows.map(({ readAt, announcement, ...n }) => ({
    ...n,
    read: readAt != null,
    from: !announcement
      ? null
      : announcement.author.role === "TEACHER"
        ? `Преподаватель ${announcement.author.teacher?.shortName ?? ""}`.trim()
        : "Деканат",
  }));
}

/** Сколько непрочитанных уведомлений уже пришло — для значка на колокольчике. */
export function countMyUnreadNotifications(ctx: RecipientContext, now: Date = new Date()): Promise<number> {
  return db.notification.count({ where: { userId: ctx.userId, readAt: null, createdAt: { lte: now } } });
}

/** Отметить прочитанными все уже пришедшие уведомления (запланированные не трогаем). */
export async function markMyNotificationsRead(ctx: RecipientContext, now: Date = new Date()): Promise<number> {
  const { count } = await db.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, createdAt: { lte: now } },
    data: { readAt: now },
  });
  return count;
}
