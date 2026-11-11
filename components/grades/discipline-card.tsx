import { AlertTriangle, CalendarCheck, CircleCheck, UserRound } from "lucide-react";
import { GradeBadge } from "@/components/grades/grade-badge";
import { disciplineAnchor } from "@/components/grades/grades-summary";
import type { GradeCell, MyDisciplineGrades } from "@/lib/data/grades";
import { formatCredit, scaleEntry } from "@/lib/grades/scale";
import { FAILING_ADVICE, disciplineIssues, isFailingLetter, type DisciplineIssues } from "@/lib/grades/stats";
import { CHECKPOINTS, FINAL_KIND_LABEL, type CheckpointNo } from "@/lib/grades/term";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

/**
 * Карточка дисциплины: средний (буква + баллы), три среза со сроками, итоговый контроль и его оценка,
 * преподаватели семинаров. Непогашенный FX/F — заметной рамкой и пояснением, но спокойным тоном;
 * FX/F за срез, закрытый сданным экзаменом или зачётом, — короткой спокойной пометкой «долг закрыт».
 */
export function DisciplineCard({
  discipline: d,
  currentCheckpoint,
  viewer = "student",
}: {
  discipline: MyDisciplineGrades;
  currentCheckpoint: CheckpointNo | null;
  /** Деканат (только чтение) — без советов студенту «спросите…» */
  viewer?: "student" | "staff";
}) {
  const issues = disciplineIssues(d);
  const problem = issues.checkpoints.length > 0 || issues.final;
  const headingId = `${disciplineAnchor(d.disciplineId)}-title`;

  return (
    <article
      id={disciplineAnchor(d.disciplineId)}
      aria-labelledby={headingId}
      className={cn(
        "flex h-full scroll-mt-28 flex-col gap-3 rounded-card border bg-surface p-4 sm:p-5 lg:scroll-mt-6",
        problem ? "border-grade-fx/60" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-[17px] leading-snug font-semibold break-words">
            {d.discipline}
          </h3>
          <p className="text-xs text-muted">Средний балл</p>
        </div>
        {d.average ? (
          <GradeBadge grade={d.average} className="shrink-0" />
        ) : (
          <span className="shrink-0 rounded-xl bg-surface-muted px-2.5 py-1.5 text-sm text-muted">нет оценок</span>
        )}
      </div>

      {problem && (
        <p className="flex items-start gap-2 rounded-xl bg-grade-fx-soft px-3 py-2 text-sm text-grade-fx">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{issueText(d, issues, viewer)}</span>
        </p>
      )}
      {issues.settled.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {checkpointList(d, issues.settled)} закрыт{issues.settled.length > 1 ? "ы" : ""}:{" "}
            {d.finalResult?.kind === "CREDIT" ? "зачёт сдан" : "экзамен сдан"}.
          </span>
        </p>
      )}

      <ol className="grid grid-cols-3 gap-2" aria-label="Срезы">
        {CHECKPOINTS.map((c, i) => (
          <CheckpointCell
            key={c.no}
            label={c.label}
            due={c.due}
            cell={d.checkpoints[i]!}
            current={c.no === currentCheckpoint}
            debt={issues.checkpoints.includes(c.no)}
          />
        ))}
      </ol>

      <div className="mt-auto space-y-2 border-t border-border pt-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <CalendarCheck className="size-4 shrink-0 text-muted" aria-hidden />
            {d.final ? (
              <span>
                <span className="font-medium">{FINAL_KIND_LABEL[d.final.kind]}</span>
                {d.final.date && <span className="text-muted"> · {formatDayMonthLong(d.final.date)}</span>}
              </span>
            ) : (
              <span className="text-muted">Итогового контроля нет в расписании</span>
            )}
          </span>
          {d.final && <FinalResultView result={d.finalResult} />}
        </div>
        <p className="flex items-start gap-1.5 text-muted">
          <UserRound className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="sr-only">Преподаватель семинаров: </span>
            {d.teachers.length > 0
              ? d.teachers.map((t, k) => (
                  <span key={t.id} title={[t.fullName, t.rank].filter(Boolean).join(", ")}>
                    {k > 0 && ", "}
                    {t.shortName}
                  </span>
                ))
              : "Преподаватель семинаров не указан"}
          </span>
        </p>
      </div>
    </article>
  );
}

function CheckpointCell({
  label,
  due,
  cell,
  current,
  debt,
}: {
  label: string;
  due: string;
  cell: GradeCell;
  current: boolean;
  /** FX/F за этот срез ещё не закрыт итоговым контролем */
  debt: boolean;
}) {
  const e = cell ? scaleEntry(cell.letter) : null;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col items-center rounded-xl px-1 py-2 text-center",
        e ? e.tone.bg : "bg-surface-muted",
        debt && "ring-1 ring-grade-fx",
        !cell && current && "ring-1 ring-primary/60 ring-inset",
      )}
    >
      <span className={cn("text-xs", e ? e.tone.text : "text-muted")}>{label}</span>
      {cell && e ? (
        <span className={cn("mt-0.5 flex items-baseline gap-1 tabular-nums", e.tone.text)}>
          <span className="text-[22px] leading-tight font-bold">{cell.letter}</span>
          <span className="text-sm font-medium">{cell.points}</span>
        </span>
      ) : (
        <span className="mt-0.5 text-[22px] leading-tight font-bold text-muted">
          <span aria-hidden>—</span>
          <span className="sr-only">не выставлен</span>
        </span>
      )}
      <span className={cn("text-[11px] leading-tight", e ? e.tone.text : current ? "text-primary" : "text-muted")}>
        {!cell && current ? "идёт · " : ""}до {formatDayMonthLong(due)}
      </span>
    </li>
  );
}

function FinalResultView({ result }: { result: MyDisciplineGrades["finalResult"] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted">Итог:</span>
      {!result ? (
        <span className="text-muted">пока нет</span>
      ) : result.kind === "EXAM" ? (
        <GradeBadge grade={result} size="sm" />
      ) : (
        <span
          className={cn(
            "rounded-lg px-2 py-0.5 font-medium",
            result.passed ? "bg-success-soft text-success" : "bg-grade-fx-soft text-grade-fx",
          )}
        >
          {formatCredit(result.passed)}
        </span>
      )}
    </span>
  );
}

/** «FX за 1-й срез», «FX за 1-й срез, F за 2-й срез» */
function checkpointList(d: MyDisciplineGrades, nos: readonly CheckpointNo[]): string {
  return nos.map((no) => `${d.checkpoints[no - 1]!.letter} за ${no}-й срез`).join(", ");
}

/**
 * Пояснение к непогашенному долгу: что не так и что это значит. FX — «можно пересдать»,
 * F — «нужно повторить курс» (как в шкале lib/grades/scale.ts); «не зачтено» — зачёт можно пересдать.
 */
function issueText(d: MyDisciplineGrades, issues: DisciplineIssues, viewer: "student" | "staff"): string {
  const parts: string[] = [];
  for (const letter of ["FX", "F"] as const) {
    const nos = issues.checkpoints.filter((no) => d.checkpoints[no - 1]!.letter === letter);
    if (nos.length > 0) parts.push(`${checkpointList(d, nos)} — ${FAILING_ADVICE[letter]}`);
  }
  const f = d.finalResult;
  if (issues.final && f) {
    parts.push(
      f.kind === "CREDIT"
        ? "зачёт не сдан — можно пересдать"
        : `экзамен — ${f.letter} (${f.points}) — ${FAILING_ADVICE[f.letter === "F" ? "F" : "FX"]}`,
    );
  }
  const text = parts.join("; ");
  const ask =
    viewer === "staff"
      ? ""
      : /повторить курс/.test(text)
        ? " Спросите в деканате, как это сделать."
        : " Спросите преподавателя семинаров, когда пересдача.";
  const closes = d.final ? ` Долг по срезам закроет сданный ${d.final.kind === "CREDIT" ? "зачёт" : "экзамен"}.` : "";
  const fixed =
    issues.checkpoints.length > 0 && !issues.final && d.average && !isFailingLetter(d.average.letter)
      ? ` Средний уже выше порога.${closes}`
      : issues.checkpoints.length > 0 && !issues.final
        ? closes
        : "";
  return `${text[0]!.toUpperCase()}${text.slice(1)}.${ask}${fixed}`;
}
