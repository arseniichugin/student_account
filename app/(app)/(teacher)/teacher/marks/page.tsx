import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { MarksPanel } from "@/components/marks/marks-panel";
import { requireTeacher } from "@/lib/auth/guards";
import { listRecentMarks } from "@/lib/data/marks";
import { getMyTeacherProfile } from "@/lib/data/teacher";

export const metadata: Metadata = { title: "Оценки" };

export default async function TeacherMarksPage() {
  const ctx = await requireTeacher();
  const [profile, recent] = await Promise.all([getMyTeacherProfile(ctx), listRecentMarks(ctx)]);

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
        Чтобы ставить оценки, нужны занятия в расписании. Если это ошибка, обратитесь в деканат.
      </EmptyState>
    );
  }

  return (
    <MarksPanel
      title="Оценки"
      subtitle={`${profile.fullName} · групп: ${profile.groups.length}`}
      hint="Начните вводить — появятся до 5 подсказок. Доступны только студенты ваших групп и только ваши прошедшие занятия; на одном занятии оценок может быть несколько."
      emptyStudentText="В ваших группах такого студента нет"
      emptyRecentText="Вы ещё не выставляли оценок. Заполните форму — оценка появится здесь, и её можно будет удалить, если ошиблись."
      recent={recent}
    />
  );
}
