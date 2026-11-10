/**
 * Подписи кабинета преподавателя: группа, итоговый контроль, число студентов.
 * Без серверного кода — нужны и серверным страницам, и клиентскому журналу.
 */
import type { FinalControl, TeacherAssignment } from "@/lib/data/grades";
import { FINAL_KIND_LABEL } from "@/lib/grades/term";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { plural } from "@/lib/utils";

export const GROUP_KIND_LABEL: Record<TeacherAssignment["group"]["kind"], string> = {
  academic: "академическая группа",
  language: "языковая группа",
  other: "группа",
};

/** «1 курс · Гриффиндор» (что известно) */
export function groupMeta(group: TeacherAssignment["group"]): string {
  return [group.course ? `${group.course} курс` : null, group.faculty].filter(Boolean).join(" · ");
}

/** «Экзамен · 19 января» / «Зачёт» / «Итогового контроля нет в расписании» */
export function finalLabel(final: FinalControl | null): string {
  if (!final) return "Итогового контроля нет в расписании";
  return final.date ? `${FINAL_KIND_LABEL[final.kind]} · ${formatDayMonthLong(final.date)}` : FINAL_KIND_LABEL[final.kind];
}

/** «20 студентов» */
export function studentsLabel(n: number): string {
  return `${n} ${plural(n, ["студент", "студента", "студентов"])}`;
}

/** «5 оценок» */
export function gradesLabel(n: number): string {
  return `${n} ${plural(n, ["оценка", "оценки", "оценок"])}`;
}

/** «до 15 ноября» — срок среза */
export function dueLabel(date: string): string {
  return `до ${formatDayMonthLong(date)}`;
}
