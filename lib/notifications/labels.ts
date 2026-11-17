/**
 * Подписи видов уведомлений и аудиторий. Без серверного кода — годится и клиентским компонентам.
 */
import type { NotificationType } from "@/lib/generated/prisma/enums";

export const NOTIFICATION_KIND_LABEL: Record<NotificationType, string> = {
  ANNOUNCEMENT: "Сообщение деканата",
  EXAM: "Экзамен",
  DEADLINE: "Срок сдачи",
  SCHEDULE_CHANGE: "Изменение расписания",
  REQUEST_STATUS: "Заявка",
};

/** Виды событий, которые создаёт деканат (статусы заявок создаются автоматически). */
export const STAFF_NOTIFICATION_KINDS = ["ANNOUNCEMENT", "EXAM", "DEADLINE", "SCHEDULE_CHANGE"] as const;
export type StaffNotificationKind = (typeof STAFF_NOTIFICATION_KINDS)[number];

/** Кому отправить: всем студентам факультета, курсу или группе. */
export const AUDIENCES = ["faculty", "course", "group"] as const;
export type AudienceType = (typeof AUDIENCES)[number];
