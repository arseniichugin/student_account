import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { UNIVERSITY_TIME_ZONE } from "@/lib/moscow-time";

/** Склеивает классы Tailwind без конфликтов (как в shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: UNIVERSITY_TIME_ZONE,
});
const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: UNIVERSITY_TIME_ZONE,
});

export const formatDate = (d: Date) => dateFmt.format(d);

export const formatDateTime = (d: Date) => dateTimeFmt.format(d);

/**
 * Форма слова для числа по-русски: plural(21, ["день", "дня", "дней"]) → «день».
 * forms — для 1, для 2–4 и для 5–20 (и 11–14).
 */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** «2 рабочих дня», «5 рабочих дней», «1 рабочий день». */
export function workDays(n: number): string {
  return `${n} ${plural(n, ["рабочий день", "рабочих дня", "рабочих дней"])}`;
}
