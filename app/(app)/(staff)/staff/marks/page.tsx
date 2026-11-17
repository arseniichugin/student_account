import type { Metadata } from "next";
import { MarksPanel } from "@/components/marks/marks-panel";
import { requireStaff } from "@/lib/auth/guards";
import { listRecentMarks } from "@/lib/data/marks";
import { getMyStaffProfile } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Ввод оценок" };

export default async function StaffMarksPage() {
  const ctx = await requireStaff();
  const [profile, recent] = await Promise.all([getMyStaffProfile(ctx), listRecentMarks(ctx)]);

  return (
    <MarksPanel
      title="Ввод оценок"
      subtitle={profile.faculty.name}
      hint="Начните вводить — появятся до 5 подсказок. Оценку можно поставить только за прошедшее занятие группы студента; на одном занятии оценок может быть несколько."
      emptyStudentText="На вашем факультете такого студента нет"
      emptyRecentText="Деканат вашего факультета ещё не выставлял оценок. Заполните форму — оценка появится здесь, и её можно будет удалить, если ошиблись."
      recent={recent}
    />
  );
}
