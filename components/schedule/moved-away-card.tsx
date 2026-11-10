import Link from "next/link";
import { ArrowRightLeft, ChevronRight } from "lucide-react";
import type { MovedAwayLesson } from "@/lib/data/schedule-moves";
import { pairLabel } from "@/lib/schedule/dates";
import { formatDayMonth } from "@/lib/schedule/moves";
import { cn } from "@/lib/utils";

/**
 * Заглушка на исходной дате перенесённого занятия: «Перенесено на 06.11, 4-я пара».
 * Без аудитории и онлайн-ссылки — занятия здесь больше нет; ссылка ведёт на день, куда его перенесли.
 */
export function MovedAwayCard({
  lesson: m,
  headingLevel = 3,
  href,
}: {
  lesson: MovedAwayLesson;
  headingLevel?: 3 | 4;
  href?: string;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const pair = pairLabel(m.pairStart, m.pairEnd);
  const toPair = pairLabel(m.toPairStart, m.toPairEnd);
  const target = `Перенесено на ${formatDayMonth(m.toDate)}, ${toPair ?? m.toStart}`;

  return (
    <article
      className="flex h-full gap-3 rounded-card border border-dashed border-warning/50 bg-surface p-4"
      aria-label={`${m.start ? `${m.start}–${m.end}, ` : ""}${m.discipline}, перенесено на другой день`}
    >
      <div className="w-12 shrink-0 tabular-nums text-muted">
        {m.start && <p className="text-[15px] font-semibold">{m.start}</p>}
        {m.end && <p className="text-sm">{m.end}</p>}
        {pair && <p className={cn("text-xs", m.start && "mt-1")}>{pair}</p>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
            <ArrowRightLeft className="size-3.5" aria-hidden />
            Перенесено
          </span>
        </div>
        <Heading className="text-[16px] leading-snug font-semibold break-words text-muted">{m.discipline}</Heading>
        <p className="text-sm text-muted">{m.kind}</p>
        {href ? (
          <Link
            href={href}
            className="-mx-2 mt-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg px-2 text-sm font-medium text-warning hover:bg-warning-soft"
          >
            <span className="min-w-0 break-words">{target}</span>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : (
          <p className="mt-1 text-sm font-medium break-words text-warning">{target}</p>
        )}
      </div>
    </article>
  );
}
