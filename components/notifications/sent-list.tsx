import { CalendarClock, Megaphone } from "lucide-react";
import { DeleteAnnouncementButton } from "@/components/notifications/delete-announcement-button";
import { Card, CardTitle } from "@/components/ui/card";
import type { SentAnnouncement } from "@/lib/data/notifications";
import { NOTIFICATION_KIND_LABEL } from "@/lib/notifications/labels";
import { formatDateTime } from "@/lib/utils";

/** «Запланированные» и «Отправленные» — общие для деканата и преподавателя. */
export function SentAnnouncements({ items, mode }: { items: SentAnnouncement[]; mode: "staff" | "teacher" }) {
  const scheduled = items.filter((a) => a.scheduled);
  const sent = items.filter((a) => !a.scheduled);
  return (
    <div className="space-y-4 self-start">
      <Card>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5 text-muted" aria-hidden />
          Запланированные
        </CardTitle>
        {scheduled.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Нет запланированных событий. Выберите «Запланировать» в форме, чтобы отправить позже.</p>
        ) : (
          <List items={scheduled} mode={mode} />
        )}
      </Card>
      <Card>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-5 text-muted" aria-hidden />
          Отправленные
        </CardTitle>
        {sent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Вы ещё ничего не отправляли. Заполните форму — событие появится здесь.</p>
        ) : (
          <List items={sent} mode={mode} />
        )}
      </Card>
    </div>
  );
}

function List({ items, mode }: { items: SentAnnouncement[]; mode: "staff" | "teacher" }) {
  return (
    <ul className="mt-2 divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-2 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">{NOTIFICATION_KIND_LABEL[a.kind]}</p>
            <p className="font-medium break-words">{a.title}</p>
            <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted">{a.body}</p>
            <p className="mt-1 text-sm">
              {a.audience} · {a.scheduled ? "отправка " : ""}
              {formatDateTime(a.publishedAt)}
            </p>
            <p className="text-xs text-muted">
              {a.scheduled ? `Получателей: ${a.recipients}` : `Прочитали ${a.read} из ${a.recipients}`} · {a.author}
            </p>
          </div>
          <DeleteAnnouncementButton id={a.id} title={a.title} scheduled={a.scheduled} mode={mode} />
        </li>
      ))}
    </ul>
  );
}
