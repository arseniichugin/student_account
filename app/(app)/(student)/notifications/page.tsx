import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarClock, Clock, FileText, GraduationCap, Megaphone, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStudent } from "@/lib/auth/guards";
import { listMyNotifications } from "@/lib/data/notifications";
import type { NotificationType } from "@/lib/generated/prisma/enums";
import { NOTIFICATION_KIND_LABEL } from "@/lib/notifications/labels";
import { cn, formatDateTime } from "@/lib/utils";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "Уведомления" };

const ICON: Record<NotificationType, LucideIcon> = {
  ANNOUNCEMENT: Megaphone,
  EXAM: GraduationCap,
  DEADLINE: Clock,
  SCHEDULE_CHANGE: CalendarClock,
  REQUEST_STATUS: FileText,
};

// Изменения и сроки выделены цветом (DESIGN.md §1.3); подпись вида рядом — цвет не единственный признак
const ICON_TONE: Record<NotificationType, string> = {
  ANNOUNCEMENT: "bg-surface-muted text-muted",
  EXAM: "bg-primary-soft text-primary",
  DEADLINE: "bg-danger-soft text-danger",
  SCHEDULE_CHANGE: "bg-warning-soft text-warning",
  REQUEST_STATUS: "bg-surface-muted text-muted",
};

/** Только адрес внутри кабинета: «/requests/…», но не «//чужой.сайт» и не «/\чужой.сайт». */
function isInternalPath(link: string): boolean {
  return /^\/(?![/\\])/.test(link);
}

export default async function NotificationsPage() {
  const ctx = await requireStudent();
  const items = await listMyNotifications(ctx);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Уведомления</h1>
        <p className="mt-1 text-muted">{unread > 0 ? `Новых: ${unread}` : "Новых нет"}</p>
      </div>
      <MarkRead unread={unread} />

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Уведомлений пока нет"
          action={
            <Link href="/today" className={buttonVariants({ variant: "secondary" })}>
              На главную
            </Link>
          }
        >
          Здесь появятся сообщения деканата, даты экзаменов, сроки сдачи и изменения статуса заявок.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => {
            const Icon = ICON[n.type];
            const content = (
              <Card className={cn("flex gap-3", !n.read && "border-primary bg-primary-soft")}>
                <span
                  className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", ICON_TONE[n.type])}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{NOTIFICATION_KIND_LABEL[n.type]}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={n.createdAt.toISOString()}>{formatDateTime(n.createdAt)}</time>
                    {!n.read && (
                      <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-on-primary">Новое</span>
                    )}
                  </p>
                  <h2 className="mt-0.5 font-semibold break-words">{n.title}</h2>
                  <p className="mt-1 text-sm break-words whitespace-pre-line">{n.body}</p>
                </div>
              </Card>
            );
            return (
              <li key={n.id}>
                {n.link && isInternalPath(n.link) ? (
                  <Link href={n.link} className="block rounded-card [&>div]:hover:border-primary">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
