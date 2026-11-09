import type { ScheduleView } from "@/lib/schedule/dates";

export type ScheduleTargetRef = { type: "group" | "teacher"; id: string };

/**
 * Адрес вкладки «Расписание»: /schedule?group=<id>&date=YYYY-MM-DD&view=day.
 * Без цели — расписание по умолчанию (своя группа у студента). view=week — по умолчанию, в адрес не пишем.
 */
export function scheduleHref({
  target,
  date,
  view,
}: {
  target?: ScheduleTargetRef | null;
  date?: string | null;
  view?: ScheduleView;
}): string {
  const p = new URLSearchParams();
  if (target) p.set(target.type, target.id);
  if (date) p.set("date", date);
  if (view === "day") p.set("view", "day");
  const qs = p.toString();
  return qs ? `/schedule?${qs}` : "/schedule";
}

/** Адрес «Сегодня» на выбранный день; сегодняшний день — без параметра. */
export function todayHref(date: string, today: string): string {
  return date === today ? "/today" : `/today?date=${date}`;
}
