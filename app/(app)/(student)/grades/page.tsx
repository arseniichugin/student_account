import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStudent } from "@/lib/auth/guards";
import { getMyGrades, type FinalResult, type GradeCell } from "@/lib/data/grades";
import { formatCredit, formatPoints } from "@/lib/grades/scale";
import { FINAL_KIND_LABEL, semesterLabel } from "@/lib/grades/term";
import { firstParam } from "@/lib/schedule/dates";

export const metadata: Metadata = { title: "Оценки" };

const cell = (g: GradeCell) => (g ? `${g.letter} (${formatPoints(g.points)})` : "—");
const final = (r: FinalResult | null) => (!r ? "—" : r.kind === "EXAM" ? `${r.letter} (${r.points})` : formatCredit(r.passed));

/**
 * ЗАГЛУШКА (каркас этапа 3): оценки студента простым списком. Адрес: /grades?semester=N.
 * Интерфейс по docs/specs/grades.md §8 (сводка, график, карточки, шкала) — отдельная задача.
 */
export default async function GradesPage({ searchParams }: PageProps<"/grades">) {
  const ctx = await requireStudent();
  const sp = await searchParams;
  const g = await getMyGrades(ctx, firstParam(sp.semester));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Оценки</h1>
        <p className="mt-1 text-muted">
          {semesterLabel(g.semester)}
          {g.termLabel ? ` · ${g.termLabel}` : ""}
        </p>
      </div>

      <nav aria-label="Семестры" className="flex flex-wrap gap-2">
        {g.semesters.map((n) => (
          <Link
            key={n}
            href={n === g.currentSemester ? "/grades" : `/grades?semester=${n}`}
            aria-current={n === g.semester ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-full bg-surface-muted px-3.5 text-sm font-medium"
          >
            {semesterLabel(n)}
          </Link>
        ))}
      </nav>

      {g.disciplines.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Оценок за этот семестр в кабинете нет" />
      ) : (
        <>
          <Card>
            <p>
              Итоговый балл: {g.overall ? cell(g.overall) : "нет оценок"} · срезов выставлено {g.summary.checkpointsGraded} из{" "}
              {g.summary.checkpointsTotal} · неудовлетворительных: {g.summary.failing}
            </p>
            {g.summary.nextFinal && (
              <p className="text-sm text-muted">
                Ближайший итоговый контроль: {FINAL_KIND_LABEL[g.summary.nextFinal.kind]} «{g.summary.nextFinal.discipline}»,{" "}
                {g.summary.nextFinal.date}
              </p>
            )}
          </Card>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {g.disciplines.map((d) => (
              <li key={d.disciplineId}>
                <Card className="text-sm">
                  <p className="text-[15px] font-semibold">{d.discipline}</p>
                  <p>Срезы: {d.checkpoints.map(cell).join(" · ")}</p>
                  <p>Средний: {d.average ? cell(d.average) : "нет оценок"}</p>
                  <p>
                    {d.final ? `${FINAL_KIND_LABEL[d.final.kind]}${d.final.date ? `, ${d.final.date}` : ""}` : "Итогового контроля нет"}: {final(d.finalResult)}
                  </p>
                  <p className="text-muted">Семинары: {d.teachers.map((t) => t.shortName).join(", ") || "—"}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
