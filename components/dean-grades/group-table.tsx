import Link from "next/link";
import { ArrowDown, ChevronRight } from "lucide-react";
import { GradeBadge } from "@/components/grades/grade-badge";
import type { GroupCell, GroupGrades, GroupGradesRow } from "@/lib/data/dean-grades";
import { formatScored } from "@/lib/grades/scale";
import { cn, plural } from "@/lib/utils";
import { deanStudentHref } from "@/lib/validation/dean-grades";

export type GroupSort = "name" | "overall";

/** Сортировка строк: по ФИО (как пришли) или по итоговому баллу — сверху лучшие, без оценок — в конце. */
export function sortGroupRows(rows: GroupGradesRow[], sort: GroupSort): GroupGradesRow[] {
  if (sort === "name") return rows;
  return [...rows].sort((a, b) => (b.overall?.points ?? -1) - (a.overall?.points ?? -1));
}

const languageTitle = (n: number) => `${n}-й язык`;

function Cell({ grade, label }: { grade: GroupCell["average"] | undefined; label: string }) {
  if (grade === undefined) {
    return (
      <span className="text-muted" title={`${label}: дисциплины нет у студента`}>
        <span aria-hidden>·</span>
        <span className="sr-only">не изучает</span>
      </span>
    );
  }
  if (grade === null) {
    return (
      <span className="text-muted" title={`${label}: нет оценок`}>
        <span aria-hidden>—</span>
        <span className="sr-only">нет оценок</span>
      </span>
    );
  }
  return <GradeBadge grade={grade} size="cell" />;
}

const debtsLabel = (n: number) => `${n} ${plural(n, ["долг", "долга", "долгов"])}`;

/**
 * Липкие слева колонки таблицы: «Студент», «Итог», «Долги» — главное видно без прокрутки на любой ширине.
 * Ширины заданы явно (left следующей = сумма ширин предыдущих): ноутбук 1024 — уже, с xl — шире.
 */
const STICKY = {
  student: "sticky left-0 w-40 min-w-40 max-w-40 xl:w-44 xl:min-w-44 xl:max-w-44",
  overall: "sticky left-40 w-16 min-w-16 max-w-16 xl:left-44 xl:w-20 xl:min-w-20 xl:max-w-20",
  debts: "sticky left-56 w-14 min-w-14 max-w-14 xl:left-64 border-r border-border",
} as const;

/**
 * Оценки группы. Над списком/таблицей — сортировка чипами «по ФИО / по баллу» (на всех ширинах).
 * Компьютер (≥ 1024 px) — таблица «студенты × дисциплины»: слева липкие «Студент», «Итог» и «Долги»,
 * дальше средний балл по каждой дисциплине цветной буквой (до xl — буква над баллами, чтобы колонки были узкими);
 * липкая шапка, прокрутка внутри своей рамки. Дисциплины языковых групп — колонки «1-й язык», «2-й язык»
 * (у соседей это разные языки). Телефон — список студентов с итоговым баллом и числом долгов. Клик — оценки студента.
 */
export function GroupTable({ data, sort, sortHref }: { data: GroupGrades; sort: GroupSort; sortHref: (s: GroupSort) => string }) {
  const rows = sortGroupRows(data.students, sort);
  const langCols = Array.from({ length: data.languageColumns }, (_, i) => i);
  const head = "sticky top-0 border-b border-border bg-surface";
  const cell = "border-b border-border group-hover:bg-surface-muted";
  const foot = "sticky bottom-0 border-t border-border bg-surface-muted";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Сортировка студентов">
        <span className="text-sm text-muted">Сортировать:</span>
        {(["name", "overall"] as const).map((s) => (
          <Link
            key={s}
            href={sortHref(s)}
            scroll={false}
            aria-current={sort === s ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium",
              sort === s ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text hover:bg-surface-muted",
            )}
          >
            {s === "name" ? "по ФИО" : "по баллу"}
          </Link>
        ))}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface lg:hidden">
        {rows.map((r) => (
          <li key={r.recordBookNo} className="relative focus-within:bg-surface-muted">
            <div className="flex min-h-16 items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link
                  href={deanStudentHref(r.recordBookNo)}
                  className="leading-snug font-medium break-words outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
                >
                  {r.fullName}
                </Link>
                <p className="text-sm text-muted">
                  <span className="sr-only">Зачётка </span>
                  {r.recordBookNo}
                  {r.debts.length > 0 ? (
                    <span className="font-medium text-danger"> · {debtsLabel(r.debts.length)}</span>
                  ) : (
                    <span> · без долгов</span>
                  )}
                </p>
              </div>
              {r.overall ? (
                <GradeBadge grade={r.overall} size="sm" className="shrink-0" />
              ) : (
                <span className="shrink-0 text-sm text-muted">нет оценок</span>
              )}
              <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
            </div>
          </li>
        ))}
      </ul>

      <div
        className="relative hidden overflow-auto rounded-card border border-border bg-surface lg:block lg:max-h-[calc(100dvh-8rem)]"
        role="region"
        aria-label={`Оценки группы ${data.group.name}`}
        tabIndex={0}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Итоговый балл и долги студентов группы {data.group.name}, средний балл по каждой дисциплине
          </caption>
          <thead>
            <tr className="align-bottom text-xs text-muted">
              <th
                scope="col"
                aria-sort={sort === "name" ? "ascending" : "none"}
                className={cn(head, STICKY.student, "z-30 px-3 py-2 text-left font-medium")}
              >
                <span className="inline-flex items-center gap-1">
                  Студент
                  {sort === "name" && <ArrowDown className="size-3.5" aria-hidden />}
                </span>
              </th>
              <th
                scope="col"
                aria-sort={sort === "overall" ? "descending" : "none"}
                className={cn(head, STICKY.overall, "z-30 px-1.5 py-2 text-center font-medium")}
              >
                <span className="inline-flex items-center gap-0.5">
                  Итог
                  {sort === "overall" && <ArrowDown className="size-3.5" aria-hidden />}
                </span>
              </th>
              <th scope="col" className={cn(head, STICKY.debts, "z-30 px-1.5 py-2 text-center font-medium")}>
                Долги
              </th>
              {data.disciplines.map((d) => (
                <th key={d.id} scope="col" title={d.name} className={cn(head, "z-20 px-0.5 py-2 font-medium")}>
                  <span className="mx-auto block max-h-36 [writing-mode:vertical-rl] rotate-180 text-left leading-tight break-words">
                    {d.name}
                  </span>
                </th>
              ))}
              {langCols.map((i) => (
                <th key={`l${i}`} scope="col" className={cn(head, "z-20 px-0.5 py-2 font-medium")}>
                  <span className="mx-auto block max-h-36 [writing-mode:vertical-rl] rotate-180 text-left leading-tight">
                    {languageTitle(i + 1)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.recordBookNo} className="group">
                <th scope="row" className={cn(cell, STICKY.student, "z-10 bg-surface px-3 py-1.5 text-left font-normal")}>
                  <Link href={deanStudentHref(r.recordBookNo)} className="flex min-h-11 flex-col justify-center">
                    <span className="leading-snug font-medium break-words text-primary underline-offset-2 hover:underline">
                      {r.fullName}
                    </span>
                    <span className="text-xs text-muted">{r.recordBookNo}</span>
                  </Link>
                </th>
                <td className={cn(cell, STICKY.overall, "z-10 bg-surface px-1 py-1.5 text-center")}>
                  {r.overall ? <GradeBadge grade={r.overall} size="cell" /> : <span className="text-muted">—</span>}
                </td>
                <td className={cn(cell, STICKY.debts, "z-10 bg-surface px-1 py-1.5 text-center")}>
                  {r.debts.length === 0 ? (
                    <span className="text-muted">нет</span>
                  ) : (
                    <span className="font-semibold text-danger" title={r.debts.map((d) => `${d.letter} — ${d.discipline}`).join(", ")}>
                      {r.debts.length}
                      <span className="sr-only">: {r.debts.map((d) => `${d.letter} — ${d.discipline}`).join(", ")}</span>
                    </span>
                  )}
                </td>
                {data.disciplines.map((d) => (
                  <td key={d.id} className={cn(cell, "px-0.5 py-1.5 text-center")}>
                    <Cell grade={d.id in r.cells ? r.cells[d.id] : undefined} label={d.name} />
                  </td>
                ))}
                {langCols.map((i) => {
                  const items = r.languages[i] ?? [];
                  return (
                    <td key={`l${i}`} className={cn(cell, "px-0.5 py-1.5 text-center")}>
                      {items.length === 0 ? (
                        <Cell grade={undefined} label={languageTitle(i + 1)} />
                      ) : (
                        items.map((it) => (
                          <span
                            key={it.disciplineId}
                            className="flex flex-col items-center"
                            title={`${it.discipline}: ${it.average ? formatScored(it.average) : "нет оценок"}`}
                          >
                            <Cell grade={it.average} label={it.discipline} />
                            <span className="max-w-12 truncate text-[10px] text-muted xl:max-w-16 xl:text-[11px]">
                              {it.discipline.split(" ")[0]}
                            </span>
                          </span>
                        ))
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs">
              <th scope="row" className={cn(foot, STICKY.student, "z-30 px-3 py-2 text-left font-medium")}>
                Средний по группе
              </th>
              <td className={cn(foot, STICKY.overall, "z-30 px-1 py-2 text-center")}>
                {data.summary.average ? <GradeBadge grade={data.summary.average} size="cell" /> : <span className="text-muted">—</span>}
              </td>
              <td className={cn(foot, STICKY.debts, "z-30 px-1 py-2 text-center font-semibold text-danger")}>
                {data.summary.withDebt > 0 ? data.summary.withDebt : <span className="font-normal text-muted">нет</span>}
              </td>
              {data.disciplines.map((d) => (
                <td key={d.id} className={cn(foot, "z-20 px-0.5 py-2 text-center")}>
                  <Cell grade={d.average} label={d.name} />
                </td>
              ))}
              {langCols.map((i) => (
                <td key={`l${i}`} className={cn(foot, "z-20 px-0.5 py-2 text-center text-muted")}>
                  <span aria-hidden>·</span>
                  <span className="sr-only">разные языки</span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hidden text-xs text-muted lg:block">
        В ячейке — средний балл по выставленным срезам. «—» — оценок пока нет, «·» — дисциплины у студента нет. В строке
        «Средний по группе» — среднее из средних студентов, в колонке «Долги» — студентов с долгами.
      </p>
    </>
  );
}
