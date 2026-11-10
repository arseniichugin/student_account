import { formatPoints, scaleEntry, type ScoredGrade } from "@/lib/grades/scale";
import { pointsWord } from "@/lib/grades/stats";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "gap-1 rounded-lg px-2 py-0.5", letter: "text-[15px]", points: "text-xs" },
  md: { box: "gap-1.5 rounded-xl px-2.5 py-1", letter: "text-[20px]", points: "text-sm" },
} as const;

/**
 * Оценка «буква крупно + баллы рядом» на «плашке» цвета буквы (токены --grade-*).
 * Цвет — не единственный признак: буква и баллы всегда видны текстом.
 */
export function GradeBadge({
  grade,
  size = "md",
  className,
}: {
  grade: ScoredGrade;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const e = scaleEntry(grade.letter);
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-baseline whitespace-nowrap tabular-nums", e.tone.bg, e.tone.text, s.box, className)}>
      <span className={cn("leading-tight font-bold", s.letter)}>{grade.letter}</span>
      <span className={cn("font-medium", s.points)}>
        {formatPoints(grade.points)}
        <span className="sr-only"> {pointsWord(grade.points)}</span>
      </span>
    </span>
  );
}

/** Крупная буква в квадрате — для итогового балла в сводке. */
export function GradeLetterTile({ grade, className }: { grade: ScoredGrade; className?: string }) {
  const e = scaleEntry(grade.letter);
  return (
    <span
      className={cn(
        "flex size-16 shrink-0 items-center justify-center rounded-2xl text-[32px] leading-none font-bold lg:size-20 lg:text-[40px]",
        e.tone.bg,
        e.tone.text,
        className,
      )}
      aria-hidden
    >
      {grade.letter}
    </span>
  );
}
