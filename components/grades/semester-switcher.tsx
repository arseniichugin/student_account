import Link from "next/link";
import { cn } from "@/lib/utils";

/** Адрес семестра: текущий — просто /grades, прошлый — /grades?semester=N. */
export const semesterHref = (n: number, current: number) => (n === current ? "/grades" : `/grades?semester=${n}`);

/**
 * Переключатель семестров: «1-й · 2-й · 3-й (текущий)». Только ссылки — работает без JavaScript.
 * У первокурсника прошлых семестров нет — переключатель не показываем.
 */
export function SemesterSwitcher({
  semesters,
  current,
  shown,
  className,
}: {
  semesters: number[];
  current: number;
  shown: number;
  className?: string;
}) {
  if (semesters.length < 2) return null;
  return (
    <nav aria-label="Семестры" className={className}>
      <ul className="flex flex-wrap gap-2">
        {[...semesters].reverse().map((n) => {
          const active = n === shown;
          return (
            <li key={n}>
              <Link
                href={semesterHref(n, current)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors",
                  active ? "bg-primary text-on-primary" : "bg-surface-muted text-text hover:bg-border",
                )}
              >
                {n}-й{n === current ? " · текущий" : ""}
                <span className="sr-only"> семестр</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
