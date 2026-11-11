import Link from "next/link";
import { cn } from "@/lib/utils";
import { deanCourseHref } from "@/lib/validation/dean-grades";

/**
 * Сегменты курсов факультета: «1 курс · 2 курс · …». Только ссылки — работает без JavaScript.
 * Сегмент не уже 48 px и не ниже 44 px; на телефоне сегменты делят ширину поровну.
 */
export function CourseSwitcher({ courses, shown, className }: { courses: number[]; shown: number; className?: string }) {
  if (courses.length < 2) return null;
  return (
    <nav aria-label="Курсы" className={cn("min-w-0 rounded-xl bg-surface-muted", className)}>
      <ul className="flex gap-1 p-1">
        {courses.map((c) => {
          const active = c === shown;
          return (
            <li key={c} className="min-w-12 flex-1 lg:flex-none">
              <Link
                href={deanCourseHref(c, courses[0])}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-lg px-2 text-[15px] font-medium whitespace-nowrap transition-colors lg:px-4",
                  active ? "bg-primary text-on-primary" : "text-text hover:bg-border",
                )}
              >
                {c}&nbsp;курс
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
