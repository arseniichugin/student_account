import type { RequestStatus } from "@/lib/generated/prisma/enums";

/**
 * Подписи статусов заявок — одно место для бейджа, пути заявки, формы сотрудника и уведомлений.
 * Без server-only: нужны и клиентским компонентам.
 */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  SUBMITTED: "Подана",
  IN_PROGRESS: "В работе",
  READY: "Готова",
  ISSUED: "Выдана",
  REJECTED: "Отклонена",
};
