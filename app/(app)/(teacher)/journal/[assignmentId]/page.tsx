import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireTeacher } from "@/lib/auth/guards";
import { getJournal, type FinalResult, type GradeCell } from "@/lib/data/grades";
import { formatCredit, formatPoints } from "@/lib/grades/scale";
import { FINAL_KIND_LABEL } from "@/lib/grades/term";

export const metadata: Metadata = { title: "Журнал группы" };

const cell = (g: GradeCell) => (g ? `${g.letter} (${formatPoints(g.points)})` : "—");
const final = (r: FinalResult | null) => (!r ? "—" : r.kind === "EXAM" ? `${r.letter} (${r.points})` : formatCredit(r.passed));

/**
 * ЗАГЛУШКА (каркас этапа 3): журнал группы простым списком, без ввода оценок.
 * Ввод — серверное действие saveGradesAction (./../actions.ts), интерфейс — отдельная задача.
 * Чужой или несуществующий assignmentId → 404 (getJournal возвращает null).
 */
export default async function JournalGroupPage({ params }: PageProps<"/journal/[assignmentId]">) {
  const ctx = await requireTeacher();
  const { assignmentId } = await params;
  const journal = await getJournal(ctx, assignmentId);
  if (!journal) notFound();
  const { assignment: a, students } = journal;

  return (
    <div className="space-y-5">
      <Link href="/journal" className="inline-flex min-h-11 items-center font-medium text-primary">
        ← Все группы
      </Link>
      <div>
        <h1 className="text-[28px] leading-tight font-bold break-words lg:text-[32px]">{a.discipline.name}</h1>
        <p className="mt-1 text-muted">
          Группа {a.group.name} · студентов {a.studentCount} ·{" "}
          {a.final ? `${FINAL_KIND_LABEL[a.final.kind]}${a.final.date ? `, ${a.final.date}` : ""}` : "итогового контроля нет"}
        </p>
      </div>
      <Card>
        <ol className="space-y-3">
          {students.map((s) => (
            <li key={s.id} className="text-sm">
              <p className="font-medium">
                {s.fullName} <span className="text-muted">· {s.recordBookNo}</span>
              </p>
              <p className="text-muted">
                Срезы: {s.checkpoints.map(cell).join(" · ")} · средний: {s.average ? cell(s.average) : "нет оценок"} · итог:{" "}
                {final(s.finalResult)}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
