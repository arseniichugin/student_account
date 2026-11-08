import { cn } from "@/lib/utils";

/** Обязательная пометка: прототип — концепт для конкурса, а не официальный сервис. */
export function ConceptBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-warning/40 bg-warning-soft px-2.5 py-0.5 text-[11px] font-medium text-warning",
        className,
      )}
      title="Это учебный прототип для конкурса. Все данные вымышлены."
    >
      Концепт для конкурса
    </span>
  );
}
