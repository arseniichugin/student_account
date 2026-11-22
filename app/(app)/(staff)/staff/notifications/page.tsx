import type { Metadata } from "next";
import { AnnouncementForm } from "@/components/notifications/announcement-form";
import { SentAnnouncements } from "@/components/notifications/sent-list";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/config";
import {
  announcementsPerHourLimit,
  countFacultyStudents,
  countFacultyTeachers,
  listFacultyAnnouncements,
  listFacultyCourses,
  listFacultyGroupChoices,
  listFacultyTeacherChoices,
} from "@/lib/data/notifications";
import { getMyStaffProfile } from "@/lib/data/profile";
import { moscowNowTime, moscowToday } from "@/lib/moscow-time";

export const metadata: Metadata = { title: "Уведомления" };

export default async function StaffNotificationsPage() {
  const ctx = await requireStaff();
  const now = new Date();
  const [profile, announcements, courses, students, teachers, groups, teacherChoices] = await Promise.all([
    getMyStaffProfile(ctx),
    listFacultyAnnouncements(ctx, now),
    listFacultyCourses(ctx),
    countFacultyStudents(ctx),
    countFacultyTeachers(ctx),
    listFacultyGroupChoices(ctx),
    listFacultyTeacherChoices(ctx),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Уведомления</h1>
        <p className="mt-1 text-muted">{profile.faculty.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-6">
        <Card className="self-start">
          <CardTitle>Новое событие</CardTitle>
          <p className="mt-0.5 mb-4 text-sm text-muted">
            Студентам и преподавателям сообщение придёт в раздел «Уведомления» — с отметкой на колокольчике.
            {isDemoMode() &&
              ` На демо-стенде аккаунт деканата общий для всех посетителей, поэтому можно отправить не больше ${announcementsPerHourLimit()} событий в час.`}
          </p>
          <AnnouncementForm
            mode="staff"
            students={students}
            teachers={teachers}
            courses={courses}
            groups={groups}
            teacherChoices={teacherChoices}
            minSendAt={`${moscowToday(now)}T${moscowNowTime(now)}`}
          />
        </Card>
        <SentAnnouncements items={announcements} mode="staff" />
      </div>
    </div>
  );
}
