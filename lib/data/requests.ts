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
  return db.requestType.findMany({
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, description: true, etaDays: true },
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

export async function createMyRequest(ctx: StudentContext, input: CreateRequestInput) {
  const type = await db.requestType.findUnique({ where: { id: input.typeId }, select: { id: true } });
  if (!type) return null;

  return db.request.create({
    data: {
      studentId: ctx.studentId, // владелец — всегда из сессии, никогда из формы
      typeId: type.id,
      payload: { destination: input.destination, copies: input.copies, comment: input.comment },
    },
    select: { id: true },
  });
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
