import { ChevronDown, CircleCheck } from "lucide-react";
import { ProgressMeter } from "@/components/journal/progress-meter";
import type { JournalFill } from "@/lib/data/dean-grades";
import { checkpointLabel, type CheckpointNo } from "@/lib/grades/term";
import { plural } from "@/lib/utils";

/** Сколько пар показывать сразу; остальные — под «Показать ещё» (<details>, без JavaScript). */
const FIRST = 6;

const LIST = "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3";

/**
 * «Заполнение журналов»: пары «дисциплина × группа × преподаватель» с прогрессом идущего среза,
 * сначала самые отстающие — видно, кто ещё не выставил. Деканат только смотрит: ссылок на журнал нет.
 */
export function JournalFillList({ journals, checkpoint }: { journals: JournalFill[]; checkpoint: CheckpointNo }) {
  const pending = journals.filter((j) => j.graded < j.total).length;
  const first = journals.slice(0, FIRST);
  const rest = journals.slice(FIRST);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {pending === 0 ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <CircleCheck className="size-4" aria-hidden />
            {checkpointLabel(checkpoint)} выставлен во всех журналах курса
          </span>
        ) : (
          `${checkpointLabel(checkpoint)} не заполнен в ${pending} ${plural(pending, ["журнале", "журналах", "журналах"])} из ${journals.length}`
        )}
      </p>
      <ul className={LIST}>
        {first.map((j) => (
          <JournalRow key={j.assignmentId} journal={j} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl px-1 font-medium text-primary [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            <span className="group-open:hidden">Показать ещё {rest.length}</span>
            <span className="hidden group-open:inline">Скрыть</span>
          </summary>
          <ul className={`${LIST} mt-2`}>
            {rest.map((j) => (
              <JournalRow key={j.assignmentId} journal={j} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function JournalRow({ journal: j }: { journal: JournalFill }) {
  return (
    <li className="min-w-0 rounded-card border border-border bg-surface p-4">
      <p className="leading-snug font-semibold break-words">{j.discipline}</p>
      <p className="mt-0.5 text-sm break-words text-muted">
        {j.group.name}
        {j.group.kind === "language" && " · языковая"} · <span title={j.teacher.fullName}>{j.teacher.shortName}</span>
      </p>
      <ProgressMeter className="mt-3" label="Выставлено" graded={j.graded} total={j.total} />
    </li>
  );
}
