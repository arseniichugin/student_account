import { AlertTriangle, CalendarClock, ClipboardCheck, Timer } from "lucide-react";
import { GradeLetterTile } from "@/components/grades/grade-badge";
import { Card } from "@/components/ui/card";
import type { MyDisciplineGrades, MyGrades } from "@/lib/data/grades";
import { formatPoints, scaleEntry } from "@/lib/grades/scale";
import { daysUntilLabel, failingScaleText, pointsWord, worstFailingLetter } from "@/lib/grades/stats";
import { CHECKPOINTS, FINAL_KIND_LABEL, checkpointLabel } from "@/lib/grades/term";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { cn, plural } from "@/lib/utils";

/** id карточки дисциплины — для ссылок «перейти к дисциплине» из сводки. */
export const disciplineAnchor = (disciplineId: string) => `discipline-${disciplineId}`;

/**
 * Сводка семестра: итоговый балл (буква крупно + баллы), срезы «выставлено из возможных»,
 * идущий срез, ближайший экзамен/зачёт и мягкое предупреждение о FX/F.
 */
export function GradesSummary({
  grades,
  failing,
  today,
  viewer = "student",
}: {
  grades: MyGrades;
  /** Дисциплины с непогашенным долгом (hasFailing): FX/F без сданного итогового контроля, «не зачтено» */
  failing: MyDisciplineGrades[];
  today: string;
  /** Кто смотрит: студент — советы «спросите…»; деканат (только чтение) — без советов, о студенте в третьем лице */
  viewer?: "student" | "staff";
}) {
  const { overall, summary: s } = grades;
  const counted = grades.disciplines.filter((d) => d.average).length;
  const current = CHECKPOINTS.find((c) => c.no === s.currentCheckpoint);
  const withF = failing.some((d) => worstFailingLetter(d) === "F");
  const progress = s.checkpointsTotal ? Math.round((s.checkpointsGraded / s.checkpointsTotal) * 100) : 0;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="sr-only">Сводка за семестр</h2>
      <div className="flex items-center gap-4">
        {overall ? (
          <>
            <GradeLetterTile grade={overall} />
            <div className="min-w-0">
              <p className="text-sm text-muted">Итоговый балл</p>
              <p className="text-[28px] leading-tight font-bold tabular-nums">
                <span className="sr-only">{overall.letter}, </span>
                {formatPoints(overall.points)}
                <span className="ml-1.5 text-[15px] font-medium text-muted">{pointsWord(overall.points)}</span>
              </p>
              <p className="text-sm text-muted">
                {scaleEntry(overall.letter).label} · «{scaleEntry(overall.letter).five}» по пятибалльной
              </p>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-muted">Итоговый балл</p>
            <p className="text-[22px] font-bold">Оценок пока нет</p>
            <p className="text-sm text-muted">Появится после первого выставленного среза.</p>
          </div>
        )}
      </div>
      {overall && (
        <p className="-mt-2 text-xs text-muted">
          Среднее из средних по {counted} {plural(counted, ["дисциплине", "дисциплинам", "дисциплинам"])} с оценками
        </p>
      )}

      <dl className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <SummaryItem icon={ClipboardCheck} label="Срезы выставлены">
          <span className="font-semibold tabular-nums">
            {s.checkpointsGraded} из {s.checkpointsTotal}
          </span>
          <span
            className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted"
            aria-hidden
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </span>
        </SummaryItem>
        <SummaryItem icon={Timer} label="Сейчас идёт">
          {current ? (
            <>
              <span className="font-semibold">{checkpointLabel(current.no)}</span>
              <span className="block text-sm text-muted">
                до {formatDayMonthLong(current.due)} · {daysUntilLabel(today, current.due)}
              </span>
            </>
          ) : (
            <span className="font-semibold">Сессия: срезы закончились</span>
          )}
        </SummaryItem>
        <SummaryItem icon={CalendarClock} label="Ближайший итоговый контроль" className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
          {s.nextFinal ? (
            <>
              <span className="font-semibold">
                {FINAL_KIND_LABEL[s.nextFinal.kind]} · {s.nextFinal.discipline}
              </span>
              <span className="block text-sm text-muted">
                {formatDayMonthLong(s.nextFinal.date)} · {daysUntilLabel(today, s.nextFinal.date)}
              </span>
            </>
          ) : (
            <span className="text-muted">Дат экзаменов и зачётов в расписании пока нет</span>
          )}
        </SummaryItem>
      </dl>

      {failing.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">
              {failing.length === 1
                ? "Есть оценка ниже порога в 1 дисциплине"
                : `Есть оценки ниже порога в ${failing.length} ${plural(failing.length, ["дисциплине", "дисциплинах", "дисциплинах"])}`}
            </p>
            <p className="mt-0.5">
              {failingScaleText(withF)}
              {viewer === "staff"
                ? "."
                : withF
                  ? ": спросите в деканате, как это сделать."
                  : ": спросите преподавателя семинаров, когда пересдача."}{" "}
              Долг по срезам закрывает сданный экзамен или зачёт.
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3">
              {failing.map((d) => (
                <li key={d.disciplineId}>
                  <a href={`#${disciplineAnchor(d.disciplineId)}`} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
                    {d.discipline}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: typeof Timer;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 gap-3", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="text-[15px] break-words">{children}</dd>
      </div>
    </div>
  );
}
