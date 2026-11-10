import Link from "next/link";
import { ChevronRight, ClipboardCheck, Users } from "lucide-react";
import type { TeacherAssignment } from "@/lib/data/grades";
import { FINAL_KIND_LABEL, checkpointLabel, type CheckpointNo } from "@/lib/grades/term";
import { cn } from "@/lib/utils";
import { GROUP_KIND_LABEL, finalLabel, groupMeta, studentsLabel } from "./labels";
import { ProgressMeter } from "./progress-meter";

/**
 * Карточка «дисциплина × группа» на экране «Мои группы». Вся карточка — ссылка на журнал группы
 * (растянутая ссылка из заголовка: одна остановка Tab, понятное имя для экранного диктора).
 */
export function AssignmentCard({
  assignment: a,
  currentCheckpoint,
  showDiscipline,
}: {
  assignment: TeacherAssignment;
  currentCheckpoint: CheckpointNo | null;
  /** Название дисциплины в карточке — когда карточки не сгруппированы по дисциплине */
  showDiscipline: boolean;
}) {
  const meta = groupMeta(a.group);
  return (
    <article className="relative flex h-full flex-col rounded-card border border-border bg-surface p-4 transition-colors focus-within:border-primary hover:border-primary sm:p-5">
      {showDiscipline && <p className="text-sm font-medium text-muted">{a.discipline.name}</p>}
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[20px] leading-tight font-semibold break-words">
          <Link
            href={`/journal/${a.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-primary"
          >
            {a.group.name}
            <span className="sr-only"> — {a.discipline.name}, открыть журнал</span>
          </Link>
        </h3>
        <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {GROUP_KIND_LABEL[a.group.kind]}
        {meta && ` · ${meta}`}
      </p>

      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-muted" aria-hidden />
          {studentsLabel(a.studentCount)}
        </li>
        <li className="flex items-center gap-2">
          <ClipboardCheck className="size-4 shrink-0 text-muted" aria-hidden />
          {finalLabel(a.final)}
        </li>
        {a.coTeachers.length > 0 && <li className="text-muted">Оценки ставит также {a.coTeachers.join(", ")}</li>}
      </ul>

      <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-border pt-3">
        {a.progress.map((p) => (
          <ProgressMeter
            key={p.checkpoint}
            label={checkpointLabel(p.checkpoint)}
            graded={p.graded}
            total={p.total}
            current={p.checkpoint === currentCheckpoint}
          />
        ))}
        {a.final && (
          <ProgressMeter
            label={FINAL_KIND_LABEL[a.final.kind]}
            graded={a.finalGraded}
            total={a.studentCount}
            current={currentCheckpoint === null}
          />
        )}
      </div>
    </article>
  );
}

/** Сколько групп ещё не закончили идущий срез — для сводки и фильтра. */
export function isCheckpointIncomplete(a: TeacherAssignment, no: CheckpointNo | null): boolean {
  if (no === null) return !!a.final && a.finalGraded < a.studentCount;
  const p = a.progress.find((x) => x.checkpoint === no);
  return !!p && p.graded < p.total;
}

export const cardGridClass = cn("grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3");
