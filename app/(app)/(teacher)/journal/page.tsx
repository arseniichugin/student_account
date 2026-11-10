import type { Metadata } from "next";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireTeacher } from "@/lib/auth/guards";
import { getMyAssignments } from "@/lib/data/grades";
import { checkpointLabel, FINAL_KIND_LABEL, termLabel } from "@/lib/grades/term";

export const metadata: Metadata = { title: "Журнал" };

/**
 * ЗАГЛУШКА (каркас этапа 3): данные выводятся простым списком. Интерфейс по docs/specs/grades.md §8
 * делает отдельная задача — функции данных и адреса здесь уже рабочие.
 */
export default async function JournalPage() {
  const ctx = await requireTeacher();
  const assignments = await getMyAssignments(ctx);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Журнал</h1>
        <p className="mt-1 text-muted">Мои группы · {termLabel()}</p>
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Групп пока нет">
          В расписании нет ваших семинаров или практических занятий — оценки ставит преподаватель семинаров группы.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {assignments.map((a) => (
            <li key={a.id}>
              <Card>
                <Link href={`/journal/${a.id}`} className="inline-flex min-h-11 items-center font-semibold text-primary">
                  {a.discipline.name} — {a.group.name}
                </Link>
                <p className="text-sm text-muted">
                  Студентов: {a.studentCount} · {a.final ? FINAL_KIND_LABEL[a.final.kind] : "Итогового контроля нет в расписании"}
                  {a.final?.date ? `, ${a.final.date}` : ""}
                  {a.coTeachers.length > 0 ? ` · вместе с ${a.coTeachers.join(", ")}` : ""}
                </p>
                <p className="mt-1 text-sm">
                  {a.progress.map((p) => `${checkpointLabel(p.checkpoint)}: ${p.graded} из ${p.total}`).join(" · ")}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
