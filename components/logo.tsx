import { cn } from "@/lib/utils";

/**
 * Временный знак: линия горизонта и восходящее солнце.
 * Собственный рисунок, не связан с логотипами реальных вузов.
 * Финальный логотип — на этапе 1 (docs/DESIGN.md).
 */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <path d="M9 20a7 7 0 0 1 14 0" className="fill-on-primary" />
        <rect x="6" y="21.5" width="20" height="2" rx="1" className="fill-on-primary" />
      </svg>
      {withText && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-text">Горизонт</span>
          <span className="block text-[11px] text-muted">цифровой деканат</span>
        </span>
      )}
    </span>
  );
}
