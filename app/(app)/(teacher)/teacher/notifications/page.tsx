import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { AnnouncementForm } from "@/components/notifications/announcement-form";
import { SentAnnouncements } from "@/components/notifications/sent-list";
import { Card, CardTitle } from "@/components/ui/card";
import { requireTeacher } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/config";
import { announcementsPerHourLimit, countTeacherStudents, listTeacherAnnouncements } from "@/lib/data/notifications";
import { getMyTeacherProfile } from "@/lib/data/teacher";
import { moscowNowTime, moscowToday } from "@/lib/moscow-time";

export const metadata: Metadata = { title: "Рассылка группам" };

export default async function TeacherNotificationsPage() {
  const ctx = await requireTeacher();
  const now = new Date();
  const [profile, announcements, students] = await Promise.all([
    getMyTeacherProfile(ctx),
    listTeacherAnnouncements(ctx, now),
    countTeacherStudents(ctx),
  ]);

  if (profile.groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="В расписании нет ваших групп"
        action={
          <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
            Открыть расписание
          </Link>
        }
      >
        Чтобы рассылать сообщения, нужны занятия в расписании. Если это ошибка, обратитесь в деканат.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Рассылка группам</h1>
        <p className="mt-1 text-muted">
          Ваши группы: {profile.groups.map((g) => g.name).join(", ") || "занятий в расписании нет"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-6">
        <Card className="self-start">
          <CardTitle>Новое событие</CardTitle>
          <p className="mt-0.5 mb-4 text-sm text-muted">
            Сообщение получат студенты ваших групп — в разделе «Уведомления», с отметкой на колокольчике.
            {isDemoMode() && ` На демо-стенде — не больше ${announcementsPerHourLimit()} событий в час.`}
          </p>
          <AnnouncementForm mode="teacher" students={students} minSendAt={`${moscowToday(now)}T${moscowNowTime(now)}`} />
        </Card>
        <SentAnnouncements items={announcements} mode="teacher" />
      </div>
    </div>
  );
}
