import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** «← вторник, 10 ноября →»: переход к предыдущему / следующему дню или неделе. */
export function PeriodNav({
  title,
  subtitle,
  prev,
  next,
}: {
  title: string;
  subtitle?: string;
  prev: { href: string; label: string };
  next: { href: string; label: string };
}) {
  return (
    <div className="flex items-center gap-2">
      <Link href={prev.href} aria-label={prev.label} title={prev.label} className={buttonVariants({ variant: "secondary", size: "icon" })}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        <p className="text-[17px] leading-snug font-semibold break-words first-letter:uppercase">{title}</p>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      <Link href={next.href} aria-label={next.label} title={next.label} className={buttonVariants({ variant: "secondary", size: "icon" })}>
        <ChevronRight className="size-5" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Выбор даты: обычная GET-форма (next/form — переход без перезагрузки страницы, без JS тоже работает).
 * hidden — остальные параметры адреса (группа, вид), чтобы их не потерять.
 */
export function DateJumpForm({
  action,
  date,
  hidden = {},
  className,
}: {
  action: string;
  date: string;
  hidden?: Record<string, string>;
  className?: string;
}) {
  return (
    <Form action={action} className={cn("flex items-center gap-2", className)}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="sr-only" htmlFor="schedule-date">
        Дата
      </label>
      <input
        id="schedule-date"
        type="date"
        name="date"
        defaultValue={date}
        key={date}
        required
        min="2000-01-01"
        max="2099-12-31"
        className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-[16px] text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <button type="submit" className={buttonVariants({ variant: "secondary" })}>
        Показать
      </button>
    </Form>
  );
}
