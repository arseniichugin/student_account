import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, UserRound, Users } from "lucide-react";
import { JournalEditor } from "@/components/journal/journal-editor";
import { GROUP_KIND_LABEL, finalLabel, groupMeta, studentsLabel } from "@/components/journal/labels";
import { requireTeacher } from "@/lib/auth/guards";
import { getJournal } from "@/lib/data/grades";

export const metadata: Metadata = { title: "Журнал группы" };

/**
 * Журнал группы: все студенты, срезы 1–3, средний и итоговая; ввод баллов — JournalEditor,
 * сохранение — saveGradesAction (../actions.ts), который заново проверяет всё на сервере.
 * Чужой или несуществующий assignmentId → 404 (getJournal ищет только среди назначений преподавателя).
 */
export default async function JournalGroupPage({ params }: PageProps<"/journal/[assignmentId]">) {
  const ctx = await requireTeacher();
  const { assignmentId } = await params;
  const journal = await getJournal(ctx, assignmentId);
  if (!journal) notFound();
  const { assignment: a } = journal;
  const meta = groupMeta(a.group);

  return (
    <div className="min-w-0 space-y-5">
      <Link href="/journal" className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 font-medium text-primary">
        <ArrowLeft className="size-4" aria-hidden />
        Назад к группам
      </Link>
      <div>
        <p className="text-sm font-medium text-muted">{a.discipline.name}</p>
        <h1 className="text-[28px] leading-tight font-bold break-words lg:text-[32px]">
          <span className="sr-only">{a.discipline.name}, </span>Группа {a.group.name}
        </h1>
        <p className="mt-1 text-muted">
          {GROUP_KIND_LABEL[a.group.kind]}
          {meta && ` · ${meta}`}
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <li className="flex items-center gap-1.5">
            <Users className="size-4 shrink-0 text-muted" aria-hidden />
            {studentsLabel(a.studentCount)}
          </li>
          <li className="flex items-center gap-1.5">
            <ClipboardCheck className="size-4 shrink-0 text-muted" aria-hidden />
            {finalLabel(a.final)}
          </li>
          {a.coTeachers.length > 0 && (
            <li className="flex items-center gap-1.5">
              <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
              Оценки ставит также {a.coTeachers.join(", ")}
            </li>
          )}
        </ul>
      </div>
      <JournalEditor journal={journal} />
    </div>
  );
}
