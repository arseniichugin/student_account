import { cn } from "@/lib/utils";

// Цвет — дополнительная подсказка: сама оценка всегда написана цифрой.
const TONE: Record<number, string> = {
  5: "bg-success-soft text-success",
  4: "bg-primary-soft text-primary",
  3: "bg-warning-soft text-warning",
  2: "bg-danger-soft text-danger",
  1: "bg-danger-soft text-danger",
};

/** Оценка 1–5 в цветном квадрате. */
export function MarkBadge({ value, size = "md", title }: { value: number; size?: "sm" | "md"; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tabular-nums",
        size === "md" ? "size-9 text-[17px]" : "size-7 text-sm",
        TONE[value] ?? "bg-surface-muted text-text",
      )}
    >
      {value}
    </span>
  );
}
