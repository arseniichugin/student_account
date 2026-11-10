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
      {/* Сегменты одинаковой ширины: 5 семестров 3-курсника помещаются в одну строку на 360 px */}
      <ul className="flex w-full gap-1 rounded-xl bg-surface-muted p-1 lg:w-auto">
        {[...semesters].reverse().map((n) => {
          const active = n === shown;
          return (
            <li key={n} className="min-w-0 flex-1 lg:flex-none">
              <Link
                href={semesterHref(n, current)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center rounded-lg px-1 text-[15px] leading-tight font-medium transition-colors lg:min-w-16 lg:px-3",
                  active ? "bg-primary text-on-primary" : "text-text hover:bg-border",
                )}
              >
                <span>
                  {n}-й<span className="sr-only"> семестр</span>
                </span>
                {n === current && <span className={cn("text-[11px]", active ? "" : "text-muted")}>текущий</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
