import { AlertTriangle, ClipboardCheck, Users } from "lucide-react";
import { GradeLetterTile } from "@/components/grades/grade-badge";
import { Card } from "@/components/ui/card";
import { percent, type CohortSummary } from "@/lib/grades/course-stats";
import { formatPoints, scaleEntry } from "@/lib/grades/scale";
import { pointsWord } from "@/lib/grades/stats";
import { checkpointLabel } from "@/lib/grades/term";
import { cn, plural } from "@/lib/utils";

export const studentsLabel = (n: number) => `${n} ${plural(n, ["студент", "студента", "студентов"])}`;

/**
 * Сводка курса или группы: средний балл (буква крупно + баллы), студентов, с долгами, заполнение среза.
 * Цвет — не единственный признак: рядом всегда буква, баллы и числа текстом.
 */
export function CohortSummaryCard({
  summary: s,
  title,
  className,
}: {
  summary: CohortSummary;
  /** Заголовок карточки для экранного диктора и на экране: «Сводка 2 курса» */
  title: string;
  className?: string;
}) {
  const fillPct = percent(s.fill.graded, s.fill.total);
  return (
    <Card className={cn("flex flex-col gap-4", className)}>
      <h2 className="sr-only">{title}</h2>
      <div className="flex items-center gap-4">
        {s.average ? (
          <>
            <GradeLetterTile grade={s.average} />
            <div className="min-w-0">
              <p className="text-sm text-muted">Средний балл</p>
              <p className="text-[28px] leading-tight font-bold tabular-nums">
                <span className="sr-only">{s.average.letter}, </span>
                {formatPoints(s.average.points)}
                <span className="ml-1.5 text-[15px] font-medium text-muted">{pointsWord(s.average.points)}</span>
              </p>
              <p className="text-sm text-muted">
                {scaleEntry(s.average.letter).label} · среднее из итоговых баллов {s.graded}{" "}
                {plural(s.graded, ["студента", "студентов", "студентов"])}
              </p>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-muted">Средний балл</p>
            <p className="text-[22px] font-bold">Оценок пока нет</p>
            <p className="text-sm text-muted">Появится после первого выставленного среза.</p>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4">
        <Item icon={Users} label="Студентов">
          <span className="font-semibold tabular-nums">{s.students}</span>
        </Item>
        <Item icon={AlertTriangle} label="С долгами FX/F" tone={s.withDebt > 0 ? "danger" : "muted"}>
          <span className={cn("font-semibold tabular-nums", s.withDebt > 0 && "text-danger")}>{s.withDebt}</span>
          <span className="text-sm text-muted"> · {percent(s.withDebt, s.students)}%</span>
        </Item>
        <Item icon={ClipboardCheck} label={`${checkpointLabel(s.checkpoint)}: выставлено оценок`} className="col-span-2">
          <span className="font-semibold tabular-nums">
            {s.fill.graded} из {s.fill.total}
          </span>
          <span className="text-sm text-muted"> · {fillPct}%</span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${fillPct}%` }} />
          </span>
        </Item>
      </dl>
    </Card>
  );
}

function Item({
  icon: Icon,
  label,
  tone = "muted",
  className,
  children,
}: {
  icon: typeof Users;
  label: string;
  tone?: "muted" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 gap-3", className)}>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary",
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="text-[15px] break-words">{children}</dd>
      </div>
    </div>
  );
}
