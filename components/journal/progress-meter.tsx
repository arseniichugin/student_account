import { cn } from "@/lib/utils";

/**
 * Полоска прогресса «2-й срез · 12 из 20». Число — в тексте (его и читает экранный диктор),
 * полоска — только наглядность. Идущий срез подсвечен акцентом и подписью «идёт», заполненный — зелёным.
 */
export function ProgressMeter({
  label,
  graded,
  total,
  current = false,
  className,
}: {
  label: string;
  graded: number;
  total: number;
  current?: boolean;
  className?: string;
}) {
  const done = total > 0 && graded >= total;
  const pct = total > 0 ? Math.round((graded / total) * 100) : 0;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className={cn("flex min-w-0 items-center gap-1.5", current ? "font-semibold text-text" : "text-muted")}>
          <span className="truncate">{label}</span>
          {current && (
            <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-primary">идёт</span>
          )}
        </span>
        <span className={cn("shrink-0 tabular-nums", done ? "font-medium text-success" : "text-text")}>
          {graded} из {total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full", done ? "bg-success" : current ? "bg-primary" : "bg-muted")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
