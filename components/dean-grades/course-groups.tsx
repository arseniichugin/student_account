import Link from "next/link";
import { AlertTriangle, ChevronRight, Users } from "lucide-react";
import { GradeBadge } from "@/components/grades/grade-badge";
import { ProgressMeter } from "@/components/journal/progress-meter";
import type { CourseGroup } from "@/lib/data/dean-grades";
import { percent } from "@/lib/grades/course-stats";
import { checkpointLabel } from "@/lib/grades/term";
import { cn } from "@/lib/utils";
import { deanGroupHref } from "@/lib/validation/dean-grades";
import { studentsLabel } from "./cohort-summary";

/**
 * Группы курса. Компьютер (≥ 1024 px) — таблица (вся строка — ссылка на группу), телефон — карточки.
 * Средний балл группы — среднее из итоговых баллов её студентов.
 */
export function CourseGroups({ groups }: { groups: CourseGroup[] }) {
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
        {groups.map((g) => (
          <li key={g.id} className="min-w-0">
            <GroupCard group={g} />
          </li>
        ))}
      </ul>

      <div className="relative hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">Группа</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Студентов</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Средний балл</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">С долгами</th>
              <th scope="col" className="w-[34%] px-3 py-2.5 font-medium">
                {groups[0] ? checkpointLabel(groups[0].summary.checkpoint) : "Срез"}: выставлено
              </th>
              <th scope="col" className="w-10 px-2">
                <span className="sr-only">Открыть</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const s = g.summary;
              return (
                <tr key={g.id} className="relative border-b border-border last:border-0 focus-within:bg-surface-muted hover:bg-surface-muted">
                  <th scope="row" className="px-4 py-3 text-left font-semibold">
                    <Link
                      href={deanGroupHref(g.id)}
                      className="outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
                    >
                      {g.name}
                    </Link>
                  </th>
                  <td className="px-3 py-3 text-right tabular-nums">{s.students}</td>
                  <td className="px-3 py-3">
                    {s.average ? <GradeBadge grade={s.average} size="sm" /> : <span className="text-muted">нет оценок</span>}
                  </td>
                  <td className={cn("px-3 py-3 text-right tabular-nums", s.withDebt > 0 && "font-semibold text-danger")}>
                    {s.withDebt}
                  </td>
                  <td className="px-3 py-3">
                    <ProgressMeter label={`${percent(s.fill.graded, s.fill.total)}%`} graded={s.fill.graded} total={s.fill.total} />
                  </td>
                  <td className="px-2 py-3 text-muted">
                    <ChevronRight className="size-5" aria-hidden />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GroupCard({ group: g }: { group: CourseGroup }) {
  const s = g.summary;
  return (
    <article className="relative flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-4 transition-colors focus-within:border-primary hover:border-primary">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[20px] leading-tight font-semibold break-words">
          <Link
            href={deanGroupHref(g.id)}
            className="outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-primary"
          >
            {g.name}
            <span className="sr-only"> — открыть оценки группы</span>
          </Link>
        </h3>
        {s.average ? (
          <GradeBadge grade={s.average} className="shrink-0" />
        ) : (
          <span className="shrink-0 rounded-xl bg-surface-muted px-2.5 py-1.5 text-sm text-muted">нет оценок</span>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li className="flex items-center gap-1.5">
          <Users className="size-4 shrink-0 text-muted" aria-hidden />
          {studentsLabel(s.students)}
        </li>
        <li className={cn("flex items-center gap-1.5", s.withDebt > 0 ? "font-medium text-danger" : "text-muted")}>
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          С долгами: {s.withDebt}
        </li>
      </ul>
      <ProgressMeter
        className="mt-auto border-t border-border pt-3"
        label={`${checkpointLabel(s.checkpoint)}: выставлено`}
        graded={s.fill.graded}
        total={s.fill.total}
        current
      />
    </article>
  );
}
