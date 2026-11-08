import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Склеивает классы Tailwind без конфликтов (как в shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});
const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export const formatDate = (d: Date) => dateFmt.format(d);

/** «2 рабочих дня», «5 рабочих дней», «1 рабочий день». */
export function workDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} рабочий день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} рабочих дня`;
  return `${n} рабочих дней`;
}
export const formatDateTime = (d: Date) => dateTimeFmt.format(d);
