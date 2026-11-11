import Link from "next/link";
import { SemesterScroller } from "@/components/grades/semester-scroller";
import { cn } from "@/lib/utils";

/**
 * Адрес семестра: текущий — просто /grades, прошлый — /grades?semester=N.
 * basePath — другой экран с теми же семестрами (оценки студента у деканата: /staff/grades/student/<зачётка>).
 */
export const semesterHref = (n: number, current: number, basePath = "/grades") =>
  n === current ? basePath : `${basePath}?semester=${n}`;

/** С какого числа семестров сегменты на телефоне перестают помещаться и ряд прокручивается (4-й курс — 7). */
const SCROLL_FROM = 6;

/**
 * Переключатель семестров: «7-й (текущий) · 6-й · … · 1-й». Только ссылки — работает без JavaScript.
 * У первокурсника прошлых семестров нет — переключатель не показываем.
 * Каждый сегмент не уже 48 px (у текущего — шире, под подпись «текущий»). Если сегменты не помещаются
 * (7 семестров 4-го курса на телефоне), ряд прокручивается вбок, а правый край «тает» — видно, что дальше
 * есть ещё семестры; выбранный семестр прокручивается в видимую часть.
 */
export function SemesterSwitcher({
  semesters,
  current,
  shown,
  basePath,
  className,
}: {
  semesters: number[];
  current: number;
  shown: number;
  /** Адрес экрана без ?semester (по умолчанию /grades) */
  basePath?: string;
  className?: string;
}) {
  if (semesters.length < 2) return null;
  const many = semesters.length >= SCROLL_FROM;
  return (
    <nav
      aria-label="Семестры"
      className={cn(
        "relative min-w-0 rounded-xl bg-surface-muted lg:w-auto",
        // Тающий правый край — только когда ряд может не поместиться (телефон, 6+ семестров)
        many &&
          "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:rounded-r-xl after:bg-linear-to-l after:from-surface-muted after:to-transparent sm:after:hidden",
        className,
      )}
    >
      <SemesterScroller className={cn("relative flex w-full gap-1 overflow-x-auto p-1 [scrollbar-width:none] lg:w-auto", many && "pr-8 sm:pr-1")}>
        {[...semesters].reverse().map((n) => {
          const active = n === shown;
          const isCurrent = n === current;
          return (
            <li key={n} className={cn("flex-1 shrink-0 lg:flex-none", isCurrent ? "min-w-[4.5rem]" : "min-w-12")}>
              <Link
                href={semesterHref(n, current, basePath)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 flex-col items-center justify-center rounded-lg px-1.5 text-[15px] leading-tight font-medium whitespace-nowrap transition-colors lg:min-w-16 lg:px-3",
                  active ? "bg-primary text-on-primary" : "text-text hover:bg-border",
                )}
              >
                <span>
                  {n}-й<span className="sr-only"> семестр</span>
                </span>
                {isCurrent && <span className={cn("text-[11px]", active ? "" : "text-muted")}>текущий</span>}
              </Link>
            </li>
          );
        })}
      </SemesterScroller>
    </nav>
  );
}
