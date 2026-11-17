import "server-only";
import { isDemoMode } from "@/lib/config";
import { db } from "@/lib/db";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";
import type { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import type { StaffNotificationKind } from "@/lib/notifications/labels";
import { GROUP_SUGGEST_LIMIT } from "@/lib/validation/notifications";

// Слой данных событий деканата (Announcement) и уведомлений студентов (Notification).
// ПРАВИЛА:
//   студент   → только свои уведомления: where.userId = ctx.userId (из сессии) и только уже
//               «отправленные» (createdAt ≤ сейчас) — запланированные заранее не видны;
//   сотрудник → события только своего факультета (facultyId = ctx.facultyId), получатели —
//               только студенты своего факультета, группа — только группа своего факультета.
// Чужая группа / чужое событие → тот же ответ, что и несуществующие.

/** Защита от спама (публичный демо-стенд, общие аккаунты деканатов): событий в час на сотрудника. */
export const MAX_ANNOUNCEMENTS_PER_HOUR = 20;
/** На публичном демо-стенде (DEMO_MODE=1) аккаунты деканатов общие — лимит строже. */
export const MAX_ANNOUNCEMENTS_PER_HOUR_DEMO = 5;

export function announcementsPerHourLimit(): number {
  return isDemoMode() ? MAX_ANNOUNCEMENTS_PER_HOUR_DEMO : MAX_ANNOUNCEMENTS_PER_HOUR;
}
/** Насколько вперёд можно запланировать отправку. */
export const MAX_SCHEDULE_AHEAD_DAYS = 180;
/** Отправка «в прошлое» с небольшим запасом считается отправкой «сейчас» (форма заполнялась пару минут). */
const PAST_TOLERANCE_MS = 10 * 60_000;

// ─── Сотрудник деканата ─────────────────────────────────────────────

export type Audience = { type: "faculty" } | { type: "course"; course: number } | { type: "group"; groupId: string };

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

/** Фильтр получателей; null — группа не найдена на факультете сотрудника. */
async function recipientsWhere(ctx: StaffContext, audience: Audience): Promise<Prisma.StudentWhereInput | null> {
  if (audience.type === "faculty") return { facultyId: ctx.facultyId };
  if (audience.type === "course") return { facultyId: ctx.facultyId, course: audience.course };
  const group = await db.group.findFirst({ where: { id: audience.groupId, facultyId: ctx.facultyId }, select: { id: true } });
  if (!group) return null;
  return {
    facultyId: ctx.facultyId,
    OR: [{ academicGroupId: group.id }, { languageGroups: { some: { groupId: group.id } } }],
  };
}

/**
 * Создать событие и разослать уведомления. Получатели определяются в момент создания:
 * каждому студенту — своя запись Notification с createdAt = время отправки
 * (у отложенного события студент увидит её, когда это время наступит).
 */
export async function createFacultyAnnouncement(
  ctx: StaffContext,
  input: CreateAnnouncementInput,
  now: Date = new Date(),
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
    where: { authorId: ctx.userId, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
  });
  const limit = announcementsPerHourLimit();
  if (recent >= limit) {
    return { ok: false, error: `Не больше ${limit} событий в час — попробуйте позже` };
  }

  const where = await recipientsWhere(ctx, input.audience);
  if (!where) return { ok: false, error: "Группа не найдена на вашем факультете — выберите её из списка" };
  const students = await db.student.findMany({ where, select: { userId: true } });
  if (students.length === 0) return { ok: false, error: "В выбранной аудитории нет студентов" };

  const created = await db.$transaction(async (tx) => {
    const a = await tx.announcement.create({
      data: {
        authorId: ctx.userId, // автор и факультет — из сессии, не из формы
        facultyId: ctx.facultyId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        course: input.audience.type === "course" ? input.audience.course : null,
        groupId: input.audience.type === "group" ? input.audience.groupId : null,
        publishedAt,
        createdAt: now,
      },
      select: { id: true },
    });
    await tx.notification.createMany({
      data: students.map((s) => ({
        userId: s.userId,
        type: input.kind,
        title: input.title,
        body: input.body,
        createdAt: publishedAt,
        announcementId: a.id,
      })),
    });
    return a;
  });

  return { ok: true, id: created.id, recipients: students.length, publishedAt, scheduled: publishedAt > now };
}

export type FacultyAnnouncement = {
  id: string;
  kind: NotificationType;
  title: string;
  body: string;
  /** «Всем студентам факультета», «2 курс», «Группа 1-ГР-1» */
  audience: string;
  author: string;
  publishedAt: Date;
  scheduled: boolean;
  recipients: number;
  read: number;
};

/** События факультета: сначала запланированные (ближайшие сверху), потом отправленные (новые сверху). */
export async function listFacultyAnnouncements(ctx: StaffContext, now: Date = new Date()): Promise<FacultyAnnouncement[]> {
  const select = {
    id: true,
    kind: true,
    title: true,
    body: true,
    course: true,
    publishedAt: true,
    group: { select: { name: true } },
    author: { select: { login: true, staff: { select: { fullName: true } } } },
    _count: { select: { notifications: true } },
  } as const;
  const [scheduled, sent] = await Promise.all([
    db.announcement.findMany({
      where: { facultyId: ctx.facultyId, publishedAt: { gt: now } },
      orderBy: { publishedAt: "asc" },
      take: 50,
      select,
    }),
    db.announcement.findMany({
      where: { facultyId: ctx.facultyId, publishedAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select,
    }),
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
    audience: a.group ? `Группа ${a.group.name}` : a.course ? `${a.course} курс` : "Всем студентам факультета",
    author: a.author.staff?.fullName ?? a.author.login,
    publishedAt: a.publishedAt,
    scheduled: a.publishedAt > now,
    recipients: a._count.notifications,
    read: read.get(a.id) ?? 0,
  }));
}

/** Отменить (удалить) событие своего факультета вместе с уведомлениями. false — не найдено или чужое. */
export async function deleteFacultyAnnouncement(ctx: StaffContext, announcementId: string): Promise<boolean> {
  const { count } = await db.announcement.deleteMany({ where: { id: announcementId, facultyId: ctx.facultyId } });
  return count > 0;
}

export type GroupSuggestion = { id: string; label: string; meta: string };

const GROUP_KIND = { ACADEMIC: "Группа", LANGUAGE: "Языковая группа", OTHER: "Группа" } as const;

/** Подсказки поля «Группа»: группы своего факультета, в которых есть студенты. */
export async function suggestFacultyGroups(ctx: StaffContext, q: string): Promise<GroupSuggestion[]> {
  const rows = await db.group.findMany({
    where: {
      facultyId: ctx.facultyId,
      name: q ? { contains: q, mode: "insensitive" } : undefined,
      OR: [{ students: { some: { facultyId: ctx.facultyId } } }, { members: { some: { student: { facultyId: ctx.facultyId } } } }],
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    take: GROUP_SUGGEST_LIMIT,
    select: {
      id: true,
      name: true,
      kind: true,
      course: true,
      _count: {
        select: {
          students: { where: { facultyId: ctx.facultyId } },
          members: { where: { student: { facultyId: ctx.facultyId } } },
        },
      },
    },
  });
  return rows.map((g) => {
    const n = g._count.students + g._count.members;
    return {
      id: g.id,
      label: g.name,
      meta: [GROUP_KIND[g.kind], g.course ? `${g.course} курс` : null, `студентов: ${n}`].filter(Boolean).join(" · "),
    };
  });
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

/** Число студентов факультета — для подписи «Всем студентам факультета (N)». */
export function countFacultyStudents(ctx: StaffContext): Promise<number> {
  return db.student.count({ where: { facultyId: ctx.facultyId } });
}

// ─── Студент ────────────────────────────────────────────────────────

export type MyNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
};

/** Уведомления студента, которые уже «пришли» (новые сверху). */
export async function listMyNotifications(ctx: StudentContext, now: Date = new Date(), take = 50): Promise<MyNotification[]> {
  const rows = await db.notification.findMany({
    where: { userId: ctx.userId, createdAt: { lte: now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: { id: true, type: true, title: true, body: true, link: true, createdAt: true, readAt: true },
  });
  return rows.map(({ readAt, ...n }) => ({ ...n, read: readAt != null }));
}

/** Сколько непрочитанных уведомлений уже пришло — для значка на колокольчике. */
export function countMyUnreadNotifications(ctx: StudentContext, now: Date = new Date()): Promise<number> {
  return db.notification.count({ where: { userId: ctx.userId, readAt: null, createdAt: { lte: now } } });
}

/** Отметить прочитанными все уже пришедшие уведомления студента (запланированные не трогаем). */
export async function markMyNotificationsRead(ctx: StudentContext, now: Date = new Date()): Promise<number> {
  const { count } = await db.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, createdAt: { lte: now } },
    data: { readAt: now },
  });
  return count;
}
