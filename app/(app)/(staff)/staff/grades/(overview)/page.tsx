import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, GraduationCap, Search, SearchX, X } from "lucide-react";
import { CohortSummaryCard, studentsLabel } from "@/components/dean-grades/cohort-summary";
import { CourseGroups } from "@/components/dean-grades/course-groups";
import { CourseSwitcher } from "@/components/dean-grades/course-switcher";
import { JournalFillList } from "@/components/dean-grades/journal-fill";
import { LetterDistribution } from "@/components/dean-grades/letter-distribution";
import { RiskList } from "@/components/dean-grades/risk-list";
import { StudentSearch } from "@/components/dean-grades/student-search";
import { GradingInfo } from "@/components/grades/grading-info";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStaff } from "@/lib/auth/guards";
import { getCourseOverview, searchFacultyStudents } from "@/lib/data/dean-grades";
import { checkpointLabel, termLabel } from "@/lib/grades/term";
import { firstParam } from "@/lib/schedule/dates";
import { STUDENT_SEARCH_MAX_LENGTH, STUDENT_SEARCH_MIN_LENGTH, deanStudentHref } from "@/lib/validation/dean-grades";

export const metadata: Metadata = { title: "Успеваемость" };

/**
 * Успеваемость факультета для деканата: /staff/grades?course=N — обзор курса (по умолчанию первый курс).
 * Только чтение и только свой факультет (ctx.facultyId из сессии). ?q=… — поиск студента без JavaScript:
 * полный номер зачётки сразу открывает студента, иначе — список найденных над обзором.
 * Телефон — одна колонка; компьютер — сводка и распределение рядом, таблицы групп и группы риска.
 */
export default async function DeanGradesPage({ searchParams }: PageProps<"/staff/grades">) {
  const ctx = await requireStaff();
  const params = await searchParams;
  const q = (firstParam(params.q) ?? "").trim().slice(0, STUDENT_SEARCH_MAX_LENGTH);
  const debt = firstParam(params.debt) ?? null;
  // Один символ — не ищем (иначе «никого не нашли» спорит с подсказкой под полем), а просим набрать больше
  const tooShort = q !== "" && q.length < STUDENT_SEARCH_MIN_LENGTH;

  const [overview, search] = await Promise.all([
    getCourseOverview(ctx, firstParam(params.course)),
    q && !tooShort ? searchFacultyStudents(ctx, q) : null,
  ]);
  if (search?.exact) redirect(deanStudentHref(search.exact));

  if (!overview) {
    return (
      <div className="space-y-5">
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Успеваемость</h1>
        <EmptyState icon={GraduationCap} title="На факультете пока нет студентов">
          Студенты появятся после загрузки файлов вуза (students.csv). Если это ошибка — проверьте импорт данных.
        </EmptyState>
      </div>
    );
  }

  const o = overview;
  const course = o.course;
  const href = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (course !== o.courses[0]) p.set("course", String(course));
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return `/staff/grades${s ? `?${s}` : ""}`;
  };
  const cp = checkpointLabel(o.summary.checkpoint);
  const example = o.sampleRecordBook ? `, например ${o.sampleRecordBook}` : "";

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Успеваемость</h1>
          <p className="mt-1 text-muted first-letter:uppercase">
            {o.faculty} · {termLabel()}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-end lg:justify-between">
          <StudentSearch course={course} initialQuery={q} example={o.sampleRecordBook} />
          <CourseSwitcher courses={o.courses} shown={course} className="lg:justify-self-end" />
        </div>
      </div>

      {(search || tooShort) && (
        <section id="search-results" aria-labelledby="search-title" className="scroll-mt-24 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="search-title" className="text-[22px] font-bold break-words">
              Поиск «{q}»
            </h2>
            <Link href={href({})} className={buttonVariants({ variant: "ghost", size: "md" })}>
              <X className="size-4" aria-hidden />
              Сбросить поиск
            </Link>
          </div>
          {search?.layout && (
            <p className="rounded-xl bg-primary-soft px-3.5 py-3 text-sm text-primary">
              Похоже, включена английская раскладка — показываем найденных по запросу «{search.layout}».
            </p>
          )}
          {!search ? (
            <EmptyState icon={Search} title={`Введите хотя бы ${STUDENT_SEARCH_MIN_LENGTH} символа`}>
              Наберите фамилию или номер зачётки{example}. Ищем только среди студентов вашего факультета.
            </EmptyState>
          ) : search.results.length === 0 ? (
            <EmptyState icon={SearchX} title="На факультете никого не нашли">
              Проверьте фамилию или номер зачётки{example}. Ищем только среди студентов вашего факультета.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {search.results.map((s) => (
                <li key={s.recordBookNo}>
                  <Link
                    href={deanStudentHref(s.recordBookNo)}
                    className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-muted focus-visible:bg-surface-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-words">{s.fullName}</span>
                      <span className="block text-sm text-muted">
                        {s.recordBookNo} · {s.group.name} · {s.course} курс
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="course-title" className="space-y-4">
        <h2 id="course-title" className="text-[22px] font-bold">
          {course} курс <span className="text-[17px] font-medium text-muted">· {studentsLabel(o.summary.students)}</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <CohortSummaryCard summary={o.summary} title={`Сводка ${course} курса`} className="lg:self-start" />
          <Card>
            <CardTitle className="mb-3">
              <span aria-hidden>Студенты по итоговому баллу</span>
              <span className="sr-only">Распределение студентов {course} курса по итоговому баллу</span>
            </CardTitle>
            <LetterDistribution distribution={o.summary.distribution} id="course-distribution" />
          </Card>
        </div>
      </section>

      <section aria-labelledby="groups-title" className="space-y-3">
        <h2 id="groups-title" className="text-[22px] font-bold">
          Группы курса <span className="text-[17px] font-medium text-muted">· {o.groups.length}</span>
        </h2>
        <CourseGroups groups={o.groups} />
      </section>

      <section id="risk" aria-labelledby="risk-title" className="scroll-mt-24 space-y-3">
        <div>
          <h2 id="risk-title" className="text-[22px] font-bold">
            Группа риска <span className="text-[17px] font-medium text-muted">· {o.risk.length}</span>
          </h2>
          <p className="text-sm text-muted">
            Студенты с непогашенными FX или F: долг за срез гасит только сданный экзамен или зачёт.
          </p>
        </div>
        <RiskList
          risk={o.risk}
          disciplines={o.riskDisciplines}
          filter={debt}
          hrefFor={(id) => `${href({ debt: id })}#risk`}
        />
      </section>

      <section aria-labelledby="journals-title" className="space-y-3">
        <div>
          <h2 id="journals-title" className="text-[22px] font-bold">
            Заполнение журналов · {cp}
          </h2>
          <p className="text-sm text-muted">Дисциплина, группа и преподаватель семинаров; сначала самые отстающие.</p>
        </div>
        {o.journals.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Журналов пока нет">
            Журналы появятся, когда в расписании курса будут семинары с преподавателями.
          </EmptyState>
        ) : (
          <JournalFillList journals={o.journals} checkpoint={o.summary.checkpoint} />
        )}
      </section>

      <GradingInfo />
    </div>
  );
}
