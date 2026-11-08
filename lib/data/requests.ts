import "server-only";
import { db } from "@/lib/db";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";
import type { RequestStatus } from "@/lib/generated/prisma/client";
import type { CreateRequestInput, UpdateRequestStatusInput } from "@/lib/validation/requests";

// ПРАВИЛО: каждый запрос к заявкам содержит фильтр по владельцу.
//   студент   → where.studentId = ctx.studentId
//   сотрудник → where.student.group.program.facultyId = ctx.facultyId
// Если объект не найден с этим фильтром, функция возвращает null,
// а страница показывает «Не найдено» — даже если заявка с таким id существует.

const requestListSelect = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  type: { select: { name: true, etaDays: true } },
} as const;

export function listRequestTypes() {
  // Сначала самые быстрые (и самые частые) справки.
  return db.requestType.findMany({
    orderBy: [{ etaDays: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, etaDays: true },
  });
}

// ─── Студент ────────────────────────────────────────────────────────

export function listMyRequests(ctx: StudentContext) {
  return db.request.findMany({
    where: { studentId: ctx.studentId },
    orderBy: { createdAt: "desc" },
    select: requestListSelect,
  });
}

export function getMyRequest(ctx: StudentContext, requestId: string) {
  return db.request.findFirst({
    where: { id: requestId, studentId: ctx.studentId },
    select: { ...requestListSelect, payload: true, staffComment: true },
  });
}

/** Защита от спама: сколько заявок может быть «в работе» одновременно и сколько можно подать за час. */
export const MAX_ACTIVE_REQUESTS = 10;
export const MAX_REQUESTS_PER_HOUR = 5;

export type CreateRequestResult = { ok: true; id: string } | { ok: false; reason: "unknown-type" | "too-many-active" | "too-many-recent" };

export async function createMyRequest(ctx: StudentContext, input: CreateRequestInput): Promise<CreateRequestResult> {
  const type = await db.requestType.findUnique({ where: { id: input.typeId }, select: { id: true } });
  if (!type) return { ok: false, reason: "unknown-type" };

  const [active, recent] = await Promise.all([
    db.request.count({ where: { studentId: ctx.studentId, status: { in: ["SUBMITTED", "IN_PROGRESS"] } } }),
    db.request.count({ where: { studentId: ctx.studentId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }),
  ]);
  if (active >= MAX_ACTIVE_REQUESTS) return { ok: false, reason: "too-many-active" };
  if (recent >= MAX_REQUESTS_PER_HOUR) return { ok: false, reason: "too-many-recent" };

  const created = await db.request.create({
    data: {
      studentId: ctx.studentId, // владелец — всегда из сессии, никогда из формы
      typeId: type.id,
      payload: { destination: input.destination, copies: input.copies, comment: input.comment },
    },
    select: { id: true },
  });
  return { ok: true, id: created.id };
}

// ─── Сотрудник деканата ─────────────────────────────────────────────

function staffScope(ctx: StaffContext) {
  return { student: { group: { program: { facultyId: ctx.facultyId } } } };
}

export function listFacultyRequests(ctx: StaffContext, status?: RequestStatus) {
  return db.request.findMany({
    where: { ...staffScope(ctx), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      ...requestListSelect,
      payload: true,
      staffComment: true,
      student: {
        select: { lastName: true, firstName: true, middleName: true, group: { select: { name: true } } },
      },
    },
  });
}

/** Количество заявок факультета по статусам — для счётчиков на фильтрах. */
export async function countFacultyRequestsByStatus(ctx: StaffContext) {
  const rows = await db.request.groupBy({
    by: ["status"],
    where: staffScope(ctx),
    _count: { _all: true },
  });
  const counts: Partial<Record<RequestStatus, number>> = {};
  let total = 0;
  for (const r of rows) {
    counts[r.status] = r._count._all;
    total += r._count._all;
  }
  return { counts, total };
}

const STATUS_LABELS: Record<RequestStatus, string> = {
  SUBMITTED: "Подана",
  IN_PROGRESS: "В работе",
  READY: "Готова",
  ISSUED: "Выдана",
  REJECTED: "Отклонена",
};

export function requestStatusLabel(status: RequestStatus) {
  return STATUS_LABELS[status];
}

/** Меняет статус заявки своего факультета и уведомляет студента. Чужая заявка → null. */
export async function updateFacultyRequestStatus(ctx: StaffContext, input: UpdateRequestStatusInput) {
  const request = await db.request.findFirst({
    where: { id: input.requestId, ...staffScope(ctx) },
    select: { id: true, type: { select: { name: true } }, student: { select: { userId: true } } },
  });
  if (!request) return null;

  return db.$transaction(async (tx) => {
    const updated = await tx.request.update({
      where: { id: request.id },
      data: { status: input.status, staffComment: input.comment || null },
      select: { id: true, status: true },
    });
    await tx.notification.create({
      data: {
        userId: request.student.userId,
        type: "REQUEST_STATUS",
        title: `${request.type.name}: ${STATUS_LABELS[input.status].toLowerCase()}`,
        body: input.comment || "Статус вашей заявки изменился.",
        link: `/requests/${request.id}`,
      },
    });
    return updated;
  });
}
