import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarOff, ChevronRight, SearchX } from "lucide-react";
import { LessonList } from "@/components/schedule/lesson-card";
import { DateJumpForm, PeriodNav } from "@/components/schedule/period-nav";
import { ScheduleSearch } from "@/components/schedule/schedule-search";
import { WeekView } from "@/components/schedule/week-view";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStudent, requireUser, type UserContext } from "@/lib/auth/guards";
import { getMyStudentProfile } from "@/lib/data/profile";
import {
  ScheduleRangeError,
  getGroupSchedule,
  getMyScheduleForRange,
  getTeacherSchedule,
  listFaculties,
  listFacultyGroups,
  weekRange,
  type ScheduleLesson,
} from "@/lib/data/schedule";
import { addDaysIso, moscowToday } from "@/lib/moscow-time";
import {
  firstParam,
  formatDayLong,
  formatWeekRange,
  groupLessonsByDate,
  parseDateParam,
  parseIdParam,
  parseViewParam,
  type ScheduleView,
} from "@/lib/schedule/dates";
import { scheduleHref, type ScheduleTargetRef } from "@/lib/schedule/links";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Расписание" };

type Loaded =
  | {
      kind: "lessons";
      title: string;
      meta: React.ReactNode;
      lessons: ScheduleLesson[];
      showTeacher: boolean;
      showGroups?: boolean;
    }
  | { kind: "notFound"; what: "group" | "teacher" }
  | { kind: "pick"; groups: { id: string; name: string; course: number | null }[] }
  | { kind: "rangeError"; message: string };

/**
 * Расписание любой группы или преподавателя (открытые данные вуза, только для вошедших).
 * Адрес: /schedule?group=<id> | ?teacher=<id>, &date=YYYY-MM-DD, &view=week|day.
 * Без цели: студенту — его расписание (академическая + его языковые группы), сотруднику — выбор группы.
 */
export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const ctx = await requireUser();
  const sp = await searchParams;
  const today = moscowToday();
  const date = parseDateParam(sp.date, today);
  const view = parseViewParam(sp.view);

  const rawGroup = firstParam(sp.group);
  const rawTeacher = firstParam(sp.teacher);
  const target: ScheduleTargetRef | null =
    rawGroup !== undefined
      ? { type: "group", id: parseIdParam(rawGroup) ?? "" }
      : rawTeacher !== undefined
        ? { type: "teacher", id: parseIdParam(rawTeacher) ?? "" }
        : null;

  const { from, to } = view === "week" ? weekRange(date) : { from: date, to: date };
  const [faculties, loaded] = await Promise.all([listFaculties(ctx), load(ctx, target, from, to, { date: date === today ? null : date, view })]);

  const href = (d: string, v: ScheduleView = view) => scheduleHref({ target, date: d === today ? null : d, view: v });
  const step = view === "week" ? 7 : 1;
  const inPeriod = from <= today && today <= to;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Расписание</h1>
        <p className="mt-1 text-muted">Любая группа или преподаватель Хогвартса.</p>
      </div>

      <Card>
        <ScheduleSearch faculties={faculties.map((f) => ({ id: f.id, name: f.name }))} date={date === today ? null : date} view={view} />
      </Card>

      {target && ctx.role === "STUDENT" && (
        <Link href={scheduleHref({ date: date === today ? null : date, view })} className={buttonVariants({ variant: "ghost", className: "-ml-3" })}>
          <ArrowLeft className="size-4" aria-hidden />
          Моё расписание
        </Link>
      )}

      {loaded.kind === "notFound" && (
        <EmptyState
          icon={SearchX}
          title={loaded.what === "group" ? "Группа не найдена" : "Преподаватель не найден"}
          action={
            <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
              К расписанию
            </Link>
          }
        >
          Возможно, ссылка устарела. Найдите {loaded.what === "group" ? "группу" : "преподавателя"} через поиск выше.
        </EmptyState>
      )}

      {loaded.kind === "rangeError" && (
        <EmptyState
          icon={AlertTriangle}
          tone="danger"
          title="Не удалось показать расписание"
          action={
            <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
              Показать текущую неделю
            </Link>
          }
        >
          {loaded.message}
        </EmptyState>
      )}

      {loaded.kind === "pick" && (
        <Card>
          <h2 className="text-[17px] font-semibold">Найдите группу или преподавателя</h2>
          <p className="mt-1 text-sm text-muted">Введите название группы или фамилию в поиске — или выберите группу своего факультета:</p>
          {loaded.groups.length === 0 ? (
            <p className="mt-3 text-sm text-muted">У факультета пока нет групп.</p>
          ) : (
            <GroupsByCourse groups={loaded.groups} hrefOf={(id) => scheduleHref({ target: { type: "group", id }, date: date === today ? null : date, view })} />
          )}
        </Card>
      )}

      {loaded.kind === "lessons" && (
        <section aria-labelledby="schedule-title" className="space-y-4">
          <div>
            <h2 id="schedule-title" className="text-[22px] leading-tight font-bold break-words">
              {loaded.title}
            </h2>
            <div className="mt-1 text-sm text-muted">{loaded.meta}</div>
          </div>

          <Card className="space-y-3">
            <nav aria-label="Вид расписания" className="flex gap-1 rounded-xl bg-surface-muted p-1">
              {(["week", "day"] as const).map((v) => (
                <Link
                  key={v}
                  href={href(v === "day" && view === "week" && inPeriod ? today : date, v)}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium",
                    view === v ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
                  )}
                >
                  {v === "week" ? "Неделя" : "День"}
                </Link>
              ))}
            </nav>
            <PeriodNav
              title={view === "week" ? formatWeekRange(from, to) : formatDayLong(date)}
              subtitle={inPeriod ? (view === "week" ? "Эта неделя" : "Сегодня") : undefined}
              prev={{ href: href(addDaysIso(date, -step)), label: view === "week" ? "Предыдущая неделя" : "Предыдущий день" }}
              next={{ href: href(addDaysIso(date, step)), label: view === "week" ? "Следующая неделя" : "Следующий день" }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {!inPeriod && (
                <Link href={href(today)} className={buttonVariants({ variant: "primary" })}>
                  {view === "week" ? "Эта неделя" : "Сегодня"}
                </Link>
              )}
              <DateJumpForm
                action="/schedule"
                date={date}
                hidden={{
                  ...(target ? { [target.type]: target.id } : {}),
                  ...(view === "day" ? { view: "day" } : {}),
                }}
              />
            </div>
          </Card>

          {loaded.lessons.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title={view === "week" ? "На этой неделе занятий нет" : "Пар нет"}
              action={
                <Link href={href(addDaysIso(date, step))} className={buttonVariants({ variant: "secondary" })}>
                  {view === "week" ? "Следующая неделя" : "Следующий день"}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              }
            >
              Каникулы, выходные или праздник — либо расписание ещё не опубликовано.
            </EmptyState>
          ) : view === "week" ? (
            <WeekView
              days={groupLessonsByDate(loaded.lessons, from, to)}
              today={today}
              dayHref={(d) => href(d, "day")}
              showTeacher={loaded.showTeacher}
              showGroups={loaded.showGroups}
            />
          ) : (
            <LessonList lessons={loaded.lessons} showTeacher={loaded.showTeacher} showGroups={loaded.showGroups} />
          )}
        </section>
      )}
    </div>
  );
}

/** Загружает то, что показать: расписание цели, «не найдено», выбор группы или ошибку периода. */
async function load(
  ctx: UserContext,
  target: ScheduleTargetRef | null,
  from: string,
  to: string,
  keep: { date: string | null; view: ScheduleView },
): Promise<Loaded> {
  // Ссылки на связанные группы сохраняют выбранную дату и вид.
  const groupHref = (id: string) => scheduleHref({ target: { type: "group", id }, ...keep });
  try {
    if (target?.type === "group") {
      const res = target.id ? await getGroupSchedule(ctx, target.id, from, to) : null;
      if (!res) return { kind: "notFound", what: "group" };
      const g = res.group;
      return {
        kind: "lessons",
        title: g.kind === "language" ? `Языковая группа ${g.name}` : `Группа ${g.name}`,
        meta: (
          <>
            <p>{[g.faculty?.name, g.course ? `${g.course} курс` : null].filter(Boolean).join(" · ")}</p>
            {g.parent && (
              <p>
                Входит в группу{" "}
                <Link href={groupHref(g.parent.id)} className="inline-flex min-h-11 items-center font-medium text-primary">
                  {g.parent.name}
                </Link>
              </p>
            )}
            {g.subgroups.length > 0 && (
              <details className="mt-1">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">
                  Языковые группы ({g.subgroups.length}) — их занятия показаны отдельно
                </summary>
                <ul className="flex flex-wrap gap-2 pt-1">
                  {g.subgroups.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={groupHref(s.id)}
                        className="inline-flex min-h-11 items-center rounded-full bg-surface-muted px-3.5 text-sm font-medium text-text hover:bg-border"
                      >
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ),
        lessons: res.lessons,
        showTeacher: true,
      };
    }

    if (target?.type === "teacher") {
      const res = target.id ? await getTeacherSchedule(ctx, target.id, from, to) : null;
      if (!res) return { kind: "notFound", what: "teacher" };
      return {
        kind: "lessons",
        title: res.teacher.fullName,
        meta: <p>{["Преподаватель", res.teacher.rank].filter(Boolean).join(" · ")}</p>,
        lessons: res.lessons,
        showTeacher: false,
        showGroups: true,
      };
    }

    if (ctx.role === "STUDENT") {
      // Студенту по умолчанию — его расписание: академическая группа + его языковые группы (без чужих языков).
      const student = await requireStudent();
      const [profile, lessons] = await Promise.all([getMyStudentProfile(student), getMyScheduleForRange(student, from, to)]);
      return {
        kind: "lessons",
        title: "Моё расписание",
        meta: (
          <>
            <p>
              Группа {profile.academicGroup.name}
              {profile.languageGroups.length > 0 && ` и языковые группы ${profile.languageGroups.join(", ")}`}
            </p>
            <Link
              href={groupHref(profile.academicGroup.id)}
              className="inline-flex min-h-11 items-center font-medium text-primary"
            >
              Расписание всей группы {profile.academicGroup.name}
            </Link>
          </>
        ),
        lessons,
        showTeacher: true,
      };
    }

    return { kind: "pick", groups: ctx.facultyId ? await listFacultyGroups(ctx, ctx.facultyId) : [] };
  } catch (e) {
    if (e instanceof ScheduleRangeError) return { kind: "rangeError", message: e.message };
    throw e;
  }
}

function GroupsByCourse({
  groups,
  hrefOf,
}: {
  groups: { id: string; name: string; course: number | null }[];
  hrefOf: (id: string) => string;
}) {
  const courses = [...new Set(groups.map((g) => g.course))];
  return (
    <div className="mt-3 space-y-3">
      {courses.map((c) => (
        <div key={c ?? "none"}>
          <h3 className="text-sm font-medium text-muted">{c ? `${c} курс` : "Без курса"}</h3>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {groups
              .filter((g) => g.course === c)
              .map((g) => (
                <li key={g.id}>
                  <Link
                    href={hrefOf(g.id)}
                    className="inline-flex min-h-11 items-center rounded-full bg-surface-muted px-3.5 text-sm font-medium hover:bg-border"
                  >
                    {g.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
