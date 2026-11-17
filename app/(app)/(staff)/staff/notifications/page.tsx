import type { Metadata } from "next";
import { CalendarClock, Megaphone } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/config";
import { announcementsPerHourLimit, countFacultyStudents, listFacultyAnnouncements, listFacultyCourses, type FacultyAnnouncement } from "@/lib/data/notifications";
import { getMyStaffProfile } from "@/lib/data/profile";
import { moscowNowTime, moscowToday } from "@/lib/moscow-time";
import { NOTIFICATION_KIND_LABEL } from "@/lib/notifications/labels";
import { formatDateTime } from "@/lib/utils";
import { AnnouncementForm } from "./announcement-form";
import { DeleteAnnouncementButton } from "./delete-announcement-button";

export const metadata: Metadata = { title: "Уведомления студентам" };

export default async function StaffNotificationsPage() {
  const ctx = await requireStaff();
  const now = new Date();
  const [profile, announcements, courses, facultyStudents] = await Promise.all([
    getMyStaffProfile(ctx),
    listFacultyAnnouncements(ctx, now),
    listFacultyCourses(ctx),
    countFacultyStudents(ctx),
  ]);
  const scheduled = announcements.filter((a) => a.scheduled);
  const sent = announcements.filter((a) => !a.scheduled);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Уведомления студентам</h1>
        <p className="mt-1 text-muted">{profile.faculty.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-6">
        <Card className="self-start">
          <CardTitle>Новое событие</CardTitle>
          <p className="mt-0.5 mb-4 text-sm text-muted">
            Сообщение придёт студентам в раздел «Уведомления» — с отметкой на колокольчике.
            {isDemoMode() &&
              ` На демо-стенде аккаунт деканата общий для всех посетителей, поэтому можно отправить не больше ${announcementsPerHourLimit()} событий в час.`}
          </p>
          <AnnouncementForm
            facultyStudents={facultyStudents}
            courses={courses}
            minSendAt={`${moscowToday(now)}T${moscowNowTime(now)}`}
          />
        </Card>

        <div className="space-y-4 self-start">
          <Card>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-5 text-muted" aria-hidden />
              Запланированные
            </CardTitle>
            {scheduled.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Нет запланированных событий. Выберите «Запланировать» в форме, чтобы отправить позже.</p>
            ) : (
              <AnnouncementList items={scheduled} />
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
              <AnnouncementList items={sent} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AnnouncementList({ items }: { items: FacultyAnnouncement[] }) {
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
          <DeleteAnnouncementButton id={a.id} title={a.title} scheduled={a.scheduled} />
        </li>
      ))}
    </ul>
  );
}
