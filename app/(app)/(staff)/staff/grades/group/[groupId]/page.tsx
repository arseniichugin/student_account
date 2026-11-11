import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { CohortSummaryCard, studentsLabel } from "@/components/dean-grades/cohort-summary";
import { GroupTable, type GroupSort } from "@/components/dean-grades/group-table";
import { LetterDistribution } from "@/components/dean-grades/letter-distribution";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { getFacultyGroupGrades } from "@/lib/data/dean-grades";
import { firstParam } from "@/lib/schedule/dates";
import { deanCourseHref, deanGroupHref } from "@/lib/validation/dean-grades";

export const metadata: Metadata = { title: "Оценки группы" };

/**
 * Оценки академической группы своего факультета: сводка и таблица «студенты × дисциплины» (компьютер)
 * или список студентов (телефон). ?sort=overall — по итоговому баллу, по умолчанию — по ФИО.
 * Чужая или несуществующая группа → 404 (layout проверяет до loading, страница — ещё раз).
 */
export default async function DeanGroupPage({ params, searchParams }: PageProps<"/staff/grades/group/[groupId]">) {
  const ctx = await requireStaff();
  const { groupId } = await params;
  const data = await getFacultyGroupGrades(ctx, groupId);
  if (!data) notFound();
  const sort: GroupSort = firstParam((await searchParams).sort) === "overall" ? "overall" : "name";
  const g = data.group;
  const course = g.course ?? data.students[0]?.course ?? null;

  return (
    <div className="min-w-0 space-y-5 lg:space-y-6">
      <Link
        href={course ? deanCourseHref(course) : "/staff/grades"}
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 font-medium text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {course ? `Назад к ${course} курсу` : "Назад к успеваемости"}
      </Link>
      <div>
        <h1 className="text-[28px] leading-tight font-bold break-words lg:text-[32px]">Группа {g.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-muted">
          <Users className="size-4 shrink-0" aria-hidden />
          {[course ? `${course} курс` : null, studentsLabel(data.students.length)].filter(Boolean).join(" · ")}
        </p>
      </div>

      {data.students.length === 0 ? (
        <EmptyState icon={Users} title="В группе пока нет студентов">
          Студенты появятся после загрузки файлов вуза (students.csv).
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <CohortSummaryCard summary={data.summary} title={`Сводка группы ${g.name}`} className="lg:self-start" />
            <Card className="max-lg:hidden">
              <CardTitle className="mb-3">Студенты по итоговому баллу</CardTitle>
              <LetterDistribution distribution={data.summary.distribution} id="group-distribution" />
            </Card>
          </div>
          <section aria-labelledby="students-title" className="space-y-3">
            <h2 id="students-title" className="text-[22px] font-bold">
              Студенты <span className="text-[17px] font-medium text-muted">· {data.students.length}</span>
            </h2>
            <GroupTable
              data={data}
              sort={sort}
              sortHref={(s) => (s === "name" ? deanGroupHref(g.id) : `${deanGroupHref(g.id)}?sort=${s}`)}
            />
          </section>
        </>
      )}
    </div>
  );
}
