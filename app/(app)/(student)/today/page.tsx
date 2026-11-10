import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CalendarOff, ChevronRight, FilePlus2 } from "lucide-react";
import { TodayGradesLink } from "@/components/grades/today-grades-link";
import { AutoRefresh } from "@/components/schedule/auto-refresh";
import { LessonList } from "@/components/schedule/lesson-card";
import { DateJumpForm, PeriodNav } from "@/components/schedule/period-nav";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStudent } from "@/lib/auth/guards";
import { getMyGradesDigest } from "@/lib/data/grades";
import { getMyStudentProfile } from "@/lib/data/profile";
import { listMyRequests } from "@/lib/data/requests";
import { getMyScheduleForDate, getMyScheduleForRange, type ScheduleLesson } from "@/lib/data/schedule";
import { getMyMovedAway, type MovedAwayLesson } from "@/lib/data/schedule-moves";
import { addDaysIso, moscowToday } from "@/lib/moscow-time";
import { dayTiming, firstDayWithLessons, formatDayLong, parseDateParam } from "@/lib/schedule/dates";
import { scheduleHref, todayHref } from "@/lib/schedule/links";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Сегодня" };

/** Сколько дней вперёд искать ближайший день с парами. */
const LOOKAHEAD_DAYS = 14;

/** «Мой день»: личное расписание на выбранный день (?date=YYYY-MM-DD), ниже — оценки (кратко) и заявки. */
export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const ctx = await requireStudent();
  const today = moscowToday();
  const date = parseDateParam((await searchParams).date, today);
  const isToday = date === today;

  const [profile, requests, lessons, movedAway, grades] = await Promise.all([
    getMyStudentProfile(ctx),
    listMyRequests(ctx),
    getMyScheduleForDate(ctx, date),
    getMyMovedAway(ctx, date, date),
    getMyGradesDigest(ctx),
  ]);

  const timing = isToday ? dayTiming(lessons, new Date()) : undefined;
  const hasActive = lessons.some((l) => l.status !== "cancelled");
  // Пар нет (или все отменены, или сегодня они уже закончились) — подскажем ближайший день с парами.
  const lookahead = !hasActive || (timing && !timing.currentId && !timing.nextId);
  const upcoming = lookahead
    ? await getMyScheduleForRange(ctx, addDaysIso(date, 1), addDaysIso(date, LOOKAHEAD_DAYS))
    : [];
  const nextDay = lookahead ? firstDayWithLessons(upcoming, date) : null;

  const active = requests.filter((r) => r.status !== "ISSUED" && r.status !== "REJECTED");
  const ready = active.filter((r) => r.status === "READY").length;

  return (
    <div className="space-y-5 lg:space-y-6">
      {isToday && <AutoRefresh />}
      <div>
        <p className="text-sm text-muted first-letter:uppercase">{formatDayLong(today)}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-bold lg:text-[32px]">Привет, {profile.firstName}!</h1>
        <p className="mt-1 text-muted">
          {profile.faculty.code} · {profile.course} курс · группа {profile.academicGroup.name}
        </p>
      </div>

      <section aria-labelledby="day-title" className="space-y-4">
        <h2 id="day-title" className="sr-only">
          Расписание на день
        </h2>
        <Card className="space-y-3">
          <PeriodNav
            title={formatDayLong(date)}
            subtitle={isToday ? "Сегодня" : undefined}
            prev={{ href: todayHref(addDaysIso(date, -1), today), label: "Предыдущий день" }}
            next={{ href: todayHref(addDaysIso(date, 1), today), label: "Следующий день" }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {!isToday && (
              <Link href="/today" className={buttonVariants({ variant: "primary" })}>
                Сегодня
              </Link>
            )}
            <DateJumpForm action="/today" date={date} />
            <Link
              href={scheduleHref({ date: isToday ? null : date })}
              className={buttonVariants({ variant: "ghost", className: "lg:ml-auto" })}
            >
              <CalendarDays className="size-4" aria-hidden />
              Расписание на неделю
            </Link>
          </div>
        </Card>

        {lessons.length === 0 && movedAway.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="Пар нет"
            action={<NextDayLink nextDay={nextDay} today={today} />}
          >
            {isToday ? "Сегодня занятий нет — можно отдохнуть." : "В этот день занятий нет."}
          </EmptyState>
        ) : (
          <>
            <DaySummary lessons={lessons} movedAway={movedAway} timing={timing} />
            <LessonList lessons={lessons} timing={timing} movedAway={movedAway} movedHref={(d) => todayHref(d, today)} />
            {lookahead && (
              <div className="flex flex-col items-start gap-1 rounded-card border border-dashed border-border p-4 text-sm text-muted sm:flex-row sm:items-center sm:gap-3">
                <span>{!hasActive ? "Все пары этого дня отменены или перенесены." : "На сегодня пары закончились."}</span>
                <NextDayLink nextDay={nextDay} today={today} variant="ghost" />
              </div>
            )}
          </>
        )}
      </section>

      <TodayGradesLink digest={grades} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <CardTitle>Мои заявки</CardTitle>
            <Link href="/requests" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
              Все заявки
            </Link>
          </div>
          {active.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted">Активных заявок нет.</p>
              <Link href="/requests/new" className={buttonVariants({ variant: "secondary", className: "mt-3" })}>
                Заказать справку
              </Link>
            </div>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {active.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-muted">
                    <span className="flex-1 text-[15px]">{r.type.name}</span>
                    <StatusBadge status={r.status} />
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
          <Card className="bg-primary-soft border-primary/20">
            <p className="text-sm text-muted">Готово к выдаче</p>
            <p className="mt-1 text-[32px] leading-none font-bold text-primary">{ready}</p>
            <p className="mt-2 text-sm text-muted">
              {ready > 0 ? "Заберите в деканате — подробности в заявке." : "Сообщим, как только справка будет готова."}
            </p>
          </Card>
          <Link href="/requests/new" className="block">
            <Card className="flex h-full items-center gap-3 hover:bg-surface-muted">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <FilePlus2 className="size-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-medium">Заказать справку</span>
                <span className="block text-sm text-muted">Без очереди в деканат</span>
              </span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Ссылка на ближайший день с парами или пояснение, что их нет. */
function NextDayLink({
  nextDay,
  today,
  variant = "secondary",
}: {
  nextDay: string | null;
  today: string;
  variant?: "secondary" | "ghost";
}) {
  if (!nextDay) {
    return (
      <Link href="/schedule" className={buttonVariants({ variant })}>
        В ближайшие {LOOKAHEAD_DAYS} {plural(LOOKAHEAD_DAYS, ["день", "дня", "дней"])} пар нет — открыть расписание
      </Link>
    );
  }
  return (
    <Link href={todayHref(nextDay, today)} className={buttonVariants({ variant, className: "-mx-1 sm:mx-0" })}>
      Ближайшие пары — {formatDayLong(nextDay)}
      <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

/** Одна строка-ответ: что сейчас / что дальше; предупреждение, если в этот день есть изменения. */
function DaySummary({
  lessons,
  movedAway,
  timing,
}: {
  lessons: ScheduleLesson[];
  movedAway: MovedAwayLesson[];
  timing?: ReturnType<typeof dayTiming>;
}) {
  const current = timing?.currentId ? lessons.find((l) => l.id === timing.currentId) : undefined;
  const next = timing?.nextId ? lessons.find((l) => l.id === timing.nextId) : undefined;
  const changed = lessons.filter((l) => l.status !== "normal");
  const where = (l: ScheduleLesson) => (l.room ? `, ауд. ${l.room}` : l.isOnline ? ", онлайн" : "");

  if (!current && !next && changed.length === 0 && movedAway.length === 0) return null;
  return (
    <div className="space-y-2">
      {(current || next) && (
        <p className="text-[15px]" role="status">
          {current && (
            <>
              Сейчас: <b className="font-semibold">{current.discipline}</b>
              {where(current)} — {timing!.currentLabel}.{" "}
            </>
          )}
          {next && (
            <>
              Следующая пара {timing!.nextLabel}: <b className="font-semibold">{next.discipline}</b>
              {where(next)}.
            </>
          )}
        </p>
      )}
      {(changed.length > 0 || movedAway.length > 0) && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Есть изменения в расписании: {changesText(changed, movedAway.length)}.</span>
        </p>
      )}
    </div>
  );
}

function changesText(changed: ScheduleLesson[], movedAway: number): string {
  const n = (s: ScheduleLesson["status"]) => changed.filter((l) => l.status === s).length;
  return [
    n("cancelled") && `отменено — ${n("cancelled")}`,
    movedAway && `перенесено на другой день — ${movedAway}`,
    n("moved") && `перенесено на этот день — ${n("moved")}`,
    n("replaced") && `замена преподавателя — ${n("replaced")}`,
  ]
    .filter(Boolean)
    .join(", ");
}
