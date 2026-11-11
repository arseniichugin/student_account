import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, GraduationCap } from "lucide-react";
import { DisciplineCard } from "@/components/grades/discipline-card";
import { CheckpointTrendChart, DisciplineAveragesChart } from "@/components/grades/grades-charts";
import { GradesSummary } from "@/components/grades/grades-summary";
import { GradingInfo } from "@/components/grades/grading-info";
import { SemesterSwitcher, semesterHref } from "@/components/grades/semester-switcher";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { getFacultyStudentGrades } from "@/lib/data/dean-grades";
import { checkpointStats, hasFailing } from "@/lib/grades/stats";
import { semesterLabel } from "@/lib/grades/term";
import { moscowToday } from "@/lib/moscow-time";
import { firstParam } from "@/lib/schedule/dates";
import { deanGroupHref, deanStudentHref, recordBookFromParam } from "@/lib/validation/dean-grades";

export const metadata: Metadata = { title: "Оценки студента" };

/**
 * Оценки студента своего факультета для деканата — по номеру зачётки. Те же данные (MyGrades) и те же блоки,
 * что видит сам студент на /grades (сводка, графики, карточки дисциплин, переключатель семестров), но только
 * чтение: без «Заказать выписку» и без советов студенту. Чужой факультет или нет такой зачётки → 404.
 */
export default async function DeanStudentPage({ params, searchParams }: PageProps<"/staff/grades/student/[recordBookNo]">) {
  const ctx = await requireStaff();
  const recordBookNo = recordBookFromParam((await params).recordBookNo);
  const data = await getFacultyStudentGrades(ctx, recordBookNo, firstParam((await searchParams).semester));
  if (!data) notFound();
  const { student: s, grades: g } = data;
  const today = moscowToday();
  const failing = g.disciplines.filter(hasFailing);
  const basePath = deanStudentHref(s.recordBookNo);

  return (
    <div className="min-w-0 space-y-5 lg:space-y-6">
      <Link href={deanGroupHref(s.group.id)} className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 font-medium text-primary">
        <ArrowLeft className="size-4" aria-hidden />
        Назад к группе {s.group.name}
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">Оценки студента · только просмотр</p>
          <h1 className="text-[28px] leading-tight font-bold break-words lg:text-[32px]">{s.fullName}</h1>
          <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
            <div className="flex gap-1.5">
              <dt className="text-muted">Зачётка</dt>
              <dd className="font-medium tabular-nums">{s.recordBookNo}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted">Группа</dt>
              <dd className="font-medium">{s.group.name}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="sr-only">Курс</dt>
              <dd className="font-medium">{s.course} курс</dd>
            </div>
          </dl>
          <p className="mt-1 text-muted first-letter:uppercase">
            {semesterLabel(g.semester)}
            {g.termLabel ? ` · ${g.termLabel}` : " · прошлый"}
          </p>
        </div>
        <SemesterSwitcher semesters={g.semesters} current={g.currentSemester} shown={g.semester} basePath={basePath} />
      </div>

      {!g.isCurrent ? (
        <EmptyState
          icon={Archive}
          title="Оценок за этот семестр в кабинете нет"
          action={
            <Link href={semesterHref(g.currentSemester, g.currentSemester, basePath)} className={buttonVariants({ variant: "primary" })}>
              К текущему семестру
            </Link>
          }
        >
          Кабинет показывает оценки с текущего семестра — прошлые сюда не переносились: они в зачётной книжке и учётной
          системе деканата.
        </EmptyState>
      ) : g.disciplines.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Дисциплин в этом семестре пока нет">
          Дисциплины появятся, когда в расписании группы студента будут занятия.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-6">
            <div className="grid grid-cols-1 content-start gap-4 lg:gap-6">
              <GradesSummary grades={g} failing={failing} today={today} viewer="staff" />
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
                  <DisciplineCard discipline={d} currentCheckpoint={g.summary.currentCheckpoint} viewer="staff" />
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
