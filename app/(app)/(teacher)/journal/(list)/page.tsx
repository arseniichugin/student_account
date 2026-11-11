import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, NotebookPen } from "lucide-react";
import { isCheckpointIncomplete } from "@/components/journal/assignment-card";
import { JournalGroups } from "@/components/journal/journal-groups";
import { dueLabel } from "@/components/journal/labels";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireTeacher } from "@/lib/auth/guards";
import { getMyAssignments } from "@/lib/data/grades";
import { CHECKPOINTS, checkpointLabel, currentCheckpoint, termLabel } from "@/lib/grades/term";
import { moscowToday } from "@/lib/moscow-time";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Журнал" };

/** «Мои группы»: карточки «дисциплина × группа» с прогрессом по срезам (docs/specs/grades.md §8). */
export default async function JournalPage() {
  const ctx = await requireTeacher();
  const assignments = await getMyAssignments(ctx);
  const current = currentCheckpoint(moscowToday());

  const header = (
    <div>
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Журнал</h1>
      <p className="mt-1 text-muted">Мои группы · {termLabel()}</p>
    </div>
  );

  // Лектор потока: назначений нет — объясняем, что делать ничего не нужно
  if (assignments.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <EmptyState
          icon={NotebookPen}
          title="Вы не ведёте семинары — выставлять оценки не нужно"
          action={
            <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
              <CalendarDays className="size-4" aria-hidden />
              Открыть расписание
            </Link>
          }
        >
          Оценки ставит преподаватель семинаров или практических занятий группы. Ваши занятия — в расписании.
        </EmptyState>
      </div>
    );
  }

  const incomplete = assignments.filter((a) => isCheckpointIncomplete(a, current)).length;
  const due = CHECKPOINTS.find((c) => c.no === current)?.due;

  return (
    <div className="space-y-5">
      {header}
      <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="font-semibold">
          {current ? `Идёт ${checkpointLabel(current)}${due ? ` — ${dueLabel(due)}` : ""}` : "Срезы закончились — впереди экзамены и зачёты"}
        </p>
        <p className={incomplete > 0 ? "text-sm text-warning" : "text-sm text-success"}>
          {incomplete > 0
            ? `Не заполнен в ${incomplete} ${plural(incomplete, ["группе", "группах", "группах"])} из ${assignments.length}`
            : "Заполнен во всех группах"}
        </p>
      </Card>
      <JournalGroups assignments={assignments} currentCheckpoint={current} />
    </div>
  );
}
