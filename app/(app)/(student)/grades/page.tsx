import type { Metadata } from "next";
import Link from "next/link";
import { Archive, CalendarDays, FileText, GraduationCap } from "lucide-react";
import { DisciplineCard } from "@/components/grades/discipline-card";
import { CheckpointTrendChart, DisciplineAveragesChart } from "@/components/grades/grades-charts";
import { GradesSummary } from "@/components/grades/grades-summary";
import { GradingInfo } from "@/components/grades/grading-info";
import { SemesterSwitcher, semesterHref } from "@/components/grades/semester-switcher";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStudent } from "@/lib/auth/guards";
import { getMyGrades } from "@/lib/data/grades";
import { checkpointStats, hasFailing } from "@/lib/grades/stats";
import { semesterLabel } from "@/lib/grades/term";
import { moscowToday } from "@/lib/moscow-time";
import { firstParam } from "@/lib/schedule/dates";

export const metadata: Metadata = { title: "Оценки" };

/**
 * Оценки студента за семестр: /grades — текущий, /grades?semester=N — прошлый (пустое состояние).
 * Телефон — одна колонка: сводка → графики → дисциплины → «Как считаются оценки».
 * Компьютер — сводка и динамика слева, столбики по дисциплинам справа; карточки в 2–3 колонки.
 */
export default async function GradesPage({ searchParams }: PageProps<"/grades">) {
  const ctx = await requireStudent();
  const g = await getMyGrades(ctx, firstParam((await searchParams).semester));
  const today = moscowToday();
  const failing = g.disciplines.filter(hasFailing);

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Оценки</h1>
          <p className="mt-1 text-muted first-letter:uppercase">
            {semesterLabel(g.semester)}
            {g.termLabel ? ` · ${g.termLabel}` : " · прошлый"}
          </p>
        </div>
        <SemesterSwitcher semesters={g.semesters} current={g.currentSemester} shown={g.semester} />
      </div>

      {!g.isCurrent ? (
        <EmptyState
          icon={Archive}
          title="Оценок за этот семестр в кабинете нет"
          action={
            <>
              <Link href={semesterHref(g.currentSemester, g.currentSemester)} className={buttonVariants({ variant: "primary" })}>
                К текущему семестру
              </Link>
              <Link href="/requests/new" className={buttonVariants({ variant: "secondary" })}>
                <FileText className="size-4" aria-hidden />
                Заказать выписку оценок
              </Link>
            </>
          }
        >
          Кабинет показывает оценки с текущего семестра — прошлые сюда не переносились. Они есть в зачётной книжке, а
          официальную выписку можно заказать в деканате.
        </EmptyState>
      ) : g.disciplines.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Дисциплин в этом семестре пока нет"
          action={
            <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
              <CalendarDays className="size-4" aria-hidden />
              Открыть расписание
            </Link>
          }
        >
          Дисциплины появятся, когда в расписании вашей группы будут занятия. Если это ошибка — сообщите в деканат.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-6">
            <div className="grid grid-cols-1 content-start gap-4 lg:gap-6">
              <GradesSummary grades={g} failing={failing} today={today} />
              <Card>
                <CardTitle>Динамика по срезам</CardTitle>
                <div className="mt-3">
                  <CheckpointTrendChart stats={checkpointStats(g.disciplines)} />
                </div>
              </Card>
            </div>
            <Card className="lg:self-start">
              <CardTitle>Средний балл по дисциплинам</CardTitle>
              <div className="mt-3">
                <DisciplineAveragesChart disciplines={g.disciplines} />
              </div>
            </Card>
          </div>

          <section aria-labelledby="disciplines-title" className="space-y-3">
            <h2 id="disciplines-title" className="text-[22px] font-bold">
              Дисциплины <span className="text-[17px] font-medium text-muted">· {g.disciplines.length}</span>
            </h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 xl:grid-cols-3">
              {g.disciplines.map((d) => (
                <li key={d.disciplineId}>
                  <DisciplineCard discipline={d} currentCheckpoint={g.summary.currentCheckpoint} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <GradingInfo />
    </div>
  );
}
