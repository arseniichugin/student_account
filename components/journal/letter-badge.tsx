import { scaleEntry, type GradeLetter } from "@/lib/grades/scale";
import { cn } from "@/lib/utils";

/**
 * Буква ECTS в цветной «плашке» (цвета — из GRADE_SCALE). Цвет не единственный признак:
 * буква видна всегда, для экранного диктора — ещё и расшифровка («B — очень хорошо»).
 * Нет оценки — «—» того же размера, чтобы колонки не «прыгали» при вводе.
 */
export function LetterBadge({
  letter,
  size = "sm",
  id,
  className,
}: {
  letter: GradeLetter | null;
  size?: "sm" | "lg";
  id?: string;
  className?: string;
}) {
  const box = size === "sm" ? "h-7 min-w-8 px-1 text-sm" : "h-11 min-w-12 px-2 text-xl";
  if (!letter) {
    return (
      <span id={id} className={cn("inline-flex shrink-0 items-center justify-center text-muted", box, className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">нет оценки</span>
      </span>
    );
  }
  const e = scaleEntry(letter);
  return (
    <span
      id={id}
      title={e.label}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-semibold", e.tone.bg, e.tone.text, box, className)}
    >
      {letter}
      <span className="sr-only"> — {e.label}</span>
    </span>
  );
}
