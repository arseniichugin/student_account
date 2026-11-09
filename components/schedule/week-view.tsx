import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LessonList } from "@/components/schedule/lesson-card";
import type { ScheduleLesson } from "@/lib/data/schedule";
import { formatDayShort, lessonsCountLabel } from "@/lib/schedule/dates";

/**
 * Неделя по дням (пн–вс). Дни без занятий — одной строкой «нет занятий».
 * Заголовок дня — ссылка на вид «День» для этой даты.
 */
export function WeekView({
  days,
  today,
  dayHref,
  showTeacher,
  showGroups,
}: {
  days: { date: string; lessons: ScheduleLesson[] }[];
  today: string;
  dayHref: (date: string) => string;
  showTeacher?: boolean;
  showGroups?: boolean;
}) {
  return (
    <div className="space-y-5">
      {days.map(({ date, lessons }) =>
        lessons.length === 0 ? (
          <p key={date} className="rounded-card border border-dashed border-border px-4 py-3 text-sm text-muted">
            <span className="font-medium text-text">{formatDayShort(date)}</span>
            {date === today && " · сегодня"} — нет занятий
          </p>
        ) : (
          <section key={date} aria-label={formatDayShort(date)} className="space-y-2">
            <h3>
              <Link
                href={dayHref(date)}
                className="-mx-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-surface-muted"
              >
                <span className="text-[17px] font-semibold">{formatDayShort(date)}</span>
                {date === today && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-on-primary">Сегодня</span>
                )}
                <span className="text-sm text-muted">{lessonsCountLabel(lessons.length)}</span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </h3>
            <LessonList lessons={lessons} showTeacher={showTeacher} showGroups={showGroups} columns />
          </section>
        ),
      )}
    </div>
  );
}
