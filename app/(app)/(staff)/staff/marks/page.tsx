import type { Metadata } from "next";
import { MarkBadge } from "@/components/marks/mark-badge";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/guards";
import { listRecentFacultyMarks } from "@/lib/data/marks";
import { getMyStaffProfile } from "@/lib/data/profile";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { formatDateTime } from "@/lib/utils";
import { DeleteMarkButton } from "./delete-mark-button";
import { MarkForm } from "./mark-form";

export const metadata: Metadata = { title: "Ввод оценок" };

export default async function StaffMarksPage() {
  const ctx = await requireStaff();
  const [profile, recent] = await Promise.all([getMyStaffProfile(ctx), listRecentFacultyMarks(ctx)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Ввод оценок</h1>
        <p className="mt-1 text-muted">{profile.faculty.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6">
        <Card className="self-start">
          <CardTitle>Новая оценка</CardTitle>
          <p className="mt-0.5 mb-4 text-sm text-muted">
            Начните вводить — появятся до 5 подсказок. Оценку можно поставить только за прошедшее занятие группы студента;
            на одном занятии оценок может быть несколько.
          </p>
          <MarkForm />
        </Card>

        <Card className="self-start">
          <CardTitle>Последние выставленные</CardTitle>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Деканат вашего факультета ещё не выставлял оценок. Заполните форму — оценка появится здесь, и её можно будет
              удалить, если ошиблись.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <MarkBadge value={m.value} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{m.student}</p>
                    <p className="text-sm break-words text-muted">
                      {m.group} · {m.discipline} · {formatDayMonthLong(m.date)}, {m.start}
                    </p>
                    <p className="text-xs text-muted">Выставлена {formatDateTime(m.createdAt)}</p>
                  </div>
                  <DeleteMarkButton markId={m.id} label={`оценку ${m.value}: ${m.student}, ${m.discipline}`} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
