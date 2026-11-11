import Link from "next/link";
import { ChevronDown, CircleCheck } from "lucide-react";
import { GradeBadge } from "@/components/grades/grade-badge";
import type { RiskStudent } from "@/lib/data/dean-grades";
import type { DebtDiscipline } from "@/lib/grades/course-stats";
import { scaleEntry } from "@/lib/grades/scale";
import { FAILING_ADVICE } from "@/lib/grades/stats";
import { cn } from "@/lib/utils";
import { deanStudentHref } from "@/lib/validation/dean-grades";

const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
    active ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text hover:bg-surface-muted",
  );

/** Долг по дисциплине: буква цветом шкалы + название; расшифровка — для экранного диктора и в подсказке. */
export function DebtBadge({ debt }: { debt: DebtDiscipline }) {
  const e = scaleEntry(debt.letter);
  return (
    <span
      title={`${debt.letter} — ${FAILING_ADVICE[debt.letter]}`}
      className={cn("inline-flex max-w-full items-baseline gap-1.5 rounded-lg px-2 py-0.5 text-sm", e.tone.bg, e.tone.text)}
    >
      <span className="font-bold">{debt.letter}</span>
      <span className="min-w-0 break-words">{debt.discipline}</span>
      <span className="sr-only"> — {FAILING_ADVICE[debt.letter]}</span>
    </span>
  );
}

/**
 * «Группа риска»: студенты курса с непогашенным FX/F (правило hasFailing — как у самого студента).
 * Фильтр по дисциплине — ссылки (?debt=<id>), работают без JavaScript. Компьютер — таблица, телефон — карточки.
 */
export function RiskList({
  risk,
  disciplines,
  filter,
  hrefFor,
}: {
  risk: RiskStudent[];
  disciplines: { id: string; name: string; count: number }[];
  /** Выбранная дисциплина (id) или null — все */
  filter: string | null;
  /** Адрес с фильтром: null — сбросить */
  hrefFor: (disciplineId: string | null) => string;
}) {
  if (risk.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-4 text-success">
        <CircleCheck className="size-5 shrink-0" aria-hidden />
        На курсе нет студентов с непогашенными FX и F.
      </p>
    );
  }
  const active = disciplines.some((d) => d.id === filter) ? filter : null;
  const shown = active ? risk.filter((r) => r.debts.some((d) => d.disciplineId === active)) : risk;

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Фильтр по дисциплине"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        <Link href={hrefFor(null)} scroll={false} aria-current={active === null ? "true" : undefined} className={chipClass(active === null)}>
          Все дисциплины
          <span className="text-xs text-muted">{risk.length}</span>
        </Link>
        {disciplines.map((d) => (
          <Link
            key={d.id}
            href={hrefFor(d.id)}
            scroll={false}
            aria-current={active === d.id ? "true" : undefined}
            className={chipClass(active === d.id)}
          >
            {d.name}
            <span className="text-xs text-muted">{d.count}</span>
          </Link>
        ))}
      </div>

      <div className="lg:hidden">
        <RiskCards students={shown.slice(0, FIRST)} />
        {shown.length > FIRST && (
          <details className="group mt-3">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl px-1 font-medium text-primary [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              <span className="group-open:hidden">Показать ещё {shown.length - FIRST}</span>
              <span className="hidden group-open:inline">Скрыть</span>
            </summary>
            <RiskCards students={shown.slice(FIRST)} className="mt-2" />
          </details>
        )}
      </div>

      <div className="relative hidden overflow-x-auto rounded-card border border-border bg-surface lg:block">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">Студент</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Зачётка</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Группа</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Итоговый балл</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Долги</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.recordBookNo} className="border-b border-border align-top last:border-0 hover:bg-surface-muted">
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  <Link href={deanStudentHref(r.recordBookNo)} className="inline-flex min-h-11 items-center text-primary underline-offset-2 hover:underline">
                    {r.fullName}
                  </Link>
                </th>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                  <span className="inline-flex min-h-11 items-center">{r.recordBookNo}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex min-h-11 items-center">{r.group.name}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex min-h-11 items-center">
                    {r.overall ? <GradeBadge grade={r.overall} size="sm" /> : <span className="text-muted">нет оценок</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <ul className="flex min-h-11 flex-wrap items-center gap-1.5">
                    {r.debts.map((d) => (
                      <li key={d.disciplineId}>
                        <DebtBadge debt={d} />
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FIRST = 8;

function RiskCards({ students, className }: { students: RiskStudent[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", className)}>
      {students.map((r) => (
        <li key={r.recordBookNo} className="relative min-w-0 rounded-card border border-grade-fx/50 bg-surface p-4 focus-within:border-primary">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 leading-snug font-semibold break-words">
              <Link
                href={deanStudentHref(r.recordBookNo)}
                className="outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-primary"
              >
                {r.fullName}
              </Link>
            </h3>
            {r.overall && <GradeBadge grade={r.overall} size="sm" className="shrink-0" />}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span className="sr-only">Зачётка </span>
            {r.recordBookNo} · {r.group.name}
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Долги">
            {r.debts.map((d) => (
              <li key={d.disciplineId} className="min-w-0">
                <DebtBadge debt={d} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
