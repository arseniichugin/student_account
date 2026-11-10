import Link from "next/link";
import { AlertTriangle, ChevronRight, GraduationCap } from "lucide-react";
import { GradeBadge } from "@/components/grades/grade-badge";
import type { MyGradesDigest } from "@/lib/data/grades";
import { formatCredit } from "@/lib/grades/scale";
import { plural } from "@/lib/utils";

/**
 * Компактный блок-ссылка «Оценки» на «Сегодня»: итоговый балл и последняя выставленная оценка.
 * Вся карточка — одна ссылка на /grades (область нажатия — вся карточка).
 */
export function TodayGradesLink({ digest }: { digest: MyGradesDigest }) {
  const last = digest.latest[0];
  return (
    <Link
      href="/grades"
      className="group flex items-center gap-3 rounded-card border border-border bg-surface p-4 hover:bg-surface-muted sm:p-5"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-6">
        <span className="flex items-center gap-2">
          <span className="text-[17px] font-semibold">Оценки</span>
          {digest.overall ? (
            <>
              <GradeBadge grade={digest.overall} size="sm" />
              <span className="text-sm text-muted">итоговый балл</span>
            </>
          ) : (
            <span className="text-sm text-muted">пока нет оценок</span>
          )}
        </span>
        {last && (
          <span className="min-w-0 text-sm text-muted">
            Последняя: <span className="text-text">{last.discipline}</span>, {last.label.toLowerCase()} —{" "}
            {last.grade ? (
              <b className="font-semibold text-text">
                {last.grade.letter} ({last.grade.points})
              </b>
            ) : (
              <b className="font-semibold text-text">{formatCredit(!!last.passed)}</b>
            )}
          </span>
        )}
        {digest.failingDisciplines > 0 && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning lg:self-auto">
            <AlertTriangle className="size-3.5" aria-hidden />
            Ниже порога: {digest.failingDisciplines} {plural(digest.failingDisciplines, ["дисциплина", "дисциплины", "дисциплин"])}
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted group-hover:text-text" aria-hidden />
    </Link>
  );
}
