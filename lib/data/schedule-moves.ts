import "server-only";
import { db } from "@/lib/db";
import type { StudentContext, UserContext } from "@/lib/auth/guards";
import type { Prisma } from "@/lib/generated/prisma/client";
import { addDaysIso, dbDateToIso, isoDateToDb } from "@/lib/moscow-time";
import { movedSearchRange, parseMovedFrom } from "@/lib/schedule/moves";
import { checkRange, myGroupIds } from "./schedule";

// Заглушки «Перенесено на 06.11, 4-я пара» на исходной дате перенесённого занятия.
// Дополнение к lib/data/schedule.ts с теми же правилами и помощниками: группы студента — myGroupIds
// (только по ctx.studentId из сессии), период — checkRange (неверный → ScheduleRangeError, как у
// getMyScheduleForRange и др.); группа и преподаватель — открытые данные вуза.

/** Занятие, которое ушло с этой даты на другую. */
export type MovedAwayLesson = {
  /** «moved-<id перенесённого занятия>» — не совпадает с id занятий */
  id: string;
  /** Исходная дата «YYYY-MM-DD» — здесь показывается заглушка */
  date: string;
  pairStart: number;
  pairEnd: number;
  /** Время исходной пары по сетке группы; null — не удалось определить */
  start: string | null;
  end: string | null;
  discipline: string;
  kind: string;
  /** Куда перенесено */
  toDate: string;
  toStart: string;
  toPairStart: number | null;
  toPairEnd: number | null;
};

/** Где искать время исходной пары: ± столько дней от исходной даты. */
const GRID_WINDOW_DAYS = 14;

/** Перенесённые с дат from…to занятия студента (академическая и его языковые группы). */
export async function getMyMovedAway(ctx: StudentContext, from: string, to: string): Promise<MovedAwayLesson[]> {
  checkRange(from, to);
  const groupIds = await myGroupIds(ctx);
  return findMovedAway(from, to, (date) => ({ groups: { some: { groupId: { in: groupIds }, date } } }));
}

/** Перенесённые с дат from…to занятия группы. */
export async function getGroupMovedAway(
  _ctx: UserContext,
  groupId: string,
  from: string,
  to: string,
): Promise<MovedAwayLesson[]> {
  checkRange(from, to);
  if (groupId.length === 0 || groupId.length > 64) return [];
  return findMovedAway(from, to, (date) => ({ groups: { some: { groupId, date } } }));
}

/** Перенесённые с дат from…to занятия преподавателя. */
export async function getTeacherMovedAway(
  _ctx: UserContext,
  teacherId: string,
  from: string,
  to: string,
): Promise<MovedAwayLesson[]> {
  checkRange(from, to);
  if (teacherId.length === 0 || teacherId.length > 64) return [];
  return findMovedAway(from, to, (date) => ({ teacherId, date }));
}

type DateFilter = { gte: Date; lte: Date };

async function findMovedAway(
  from: string,
  to: string,
  scope: (date: DateFilter) => Prisma.LessonWhereInput,
): Promise<MovedAwayLesson[]> {
  const search = movedSearchRange(from, to);
  const rows = await db.lesson.findMany({
    where: {
      AND: [scope({ gte: isoDateToDb(search.from), lte: isoDateToDb(search.to) }), { status: "MOVED", note: { not: null } }],
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      date: true,
      startTime: true,
      pairStart: true,
      pairEnd: true,
      kind: true,
      note: true,
      discipline: { select: { name: true } },
      groups: { select: { groupId: true } },
    },
  });

  const moved = rows.flatMap((l) => {
    const toDate = dbDateToIso(l.date);
    const origin = parseMovedFrom(l.note, toDate);
    if (!origin || origin.date < from || origin.date > to) return [];
    return [{ l, toDate, origin }];
  });
  if (moved.length === 0) return [];

  // Время исходной пары: у других занятий тех же групп с тем же номером пары рядом с исходной датой.
  const groupIds = [...new Set(moved.flatMap((m) => m.l.groups.map((g) => g.groupId)))];
  const dates = moved.map((m) => m.origin.date).sort();
  const grid = await db.lesson.findMany({
    where: {
      pairStart: { in: [...new Set(moved.map((m) => m.origin.pairStart))] },
      groups: {
        some: {
          groupId: { in: groupIds },
          date: {
            gte: isoDateToDb(addDaysIso(dates[0]!, -GRID_WINDOW_DAYS)),
            lte: isoDateToDb(addDaysIso(dates[dates.length - 1]!, GRID_WINDOW_DAYS)),
          },
        },
      },
    },
    select: { pairStart: true, pairEnd: true, startTime: true, endTime: true, groups: { select: { groupId: true } } },
    take: 500,
  });

  return moved.map(({ l, toDate, origin }) => {
    const own = new Set(l.groups.map((g) => g.groupId));
    const sameSlot = grid.find(
      (g) => g.pairStart === origin.pairStart && (g.pairEnd ?? g.pairStart) === origin.pairEnd && g.groups.some((x) => own.has(x.groupId)),
    );
    return {
      id: `moved-${l.id}`,
      date: origin.date,
      pairStart: origin.pairStart,
      pairEnd: origin.pairEnd,
      start: sameSlot?.startTime ?? null,
      end: sameSlot?.endTime ?? null,
      discipline: l.discipline.name,
      kind: l.kind,
      toDate,
      toStart: l.startTime,
      toPairStart: l.pairStart,
      toPairEnd: l.pairEnd,
    };
  });
}
