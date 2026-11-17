import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarX, Trash2, X } from "lucide-react";
import { MarkBadge } from "@/components/marks/mark-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { requireTeacher } from "@/lib/auth/guards";
import { getTeacherJournal, listTeacherClasses, type Journal, type JournalCell } from "@/lib/data/journal";
import { getMyTeacherProfile } from "@/lib/data/teacher";
import type { AttendanceStatus } from "@/lib/generated/prisma/enums";
import { addJournalMarkAction, removeJournalMarkAction, setJournalAttendanceAction } from "@/lib/journal/actions";
import { MARK_VALUES } from "@/lib/marks/stats";
import { journalMessage } from "@/lib/validation/journal";
import { firstParam, formatDayMonthLong, parseIdParam } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Журнал" };

// Журнал преподавателя: строки — студенты группы, столбцы — его прошедшие занятия по предмету.
// Всё на сервере: выбор группы и клетки — ссылки, сохранение — обычные формы (<form action>),
// поэтому журнал работает и без JavaScript.

const ATTENDANCE: Record<AttendanceStatus, { short: string; label: string; tone: string }> = {
  PRESENT: { short: "✓", label: "Был", tone: "text-success" },
  LATE: { short: "оп", label: "Опоздал", tone: "text-warning" },
  ABSENT: { short: "н", label: "Не был", tone: "text-danger" },
};

type Query = { group?: string; discipline?: string; all?: boolean; cell?: string };

function journalHref(q: Query): string {
  const p = new URLSearchParams();
  if (q.group) p.set("group", q.group);
  if (q.discipline) p.set("discipline", q.discipline);
  if (q.all) p.set("all", "1");
  if (q.cell) p.set("cell", q.cell);
  const s = p.toString();
  return `/teacher/marks${s ? `?${s}` : ""}`;
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export default async function TeacherJournalPage({ searchParams }: PageProps<"/teacher/marks">) {
  const ctx = await requireTeacher();
  const sp = await searchParams;
  const group = parseIdParam(firstParam(sp.group)) ?? undefined;
  const discipline = parseIdParam(firstParam(sp.discipline)) ?? undefined;
  const all = firstParam(sp.all) === "1";
  const cell = firstParam(sp.cell)?.slice(0, 140);
  // В адресе — только код сообщения, текст — из справочника (чужая ссылка не подставит свой текст)
  const msg = journalMessage(firstParam(sp.msg)) ?? undefined;

  const [profile, classes] = await Promise.all([getMyTeacherProfile(ctx), listTeacherClasses(ctx)]);

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="В расписании нет ваших групп"
        action={
          <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
            Открыть расписание
          </Link>
        }
      >
        Журнал строится по вашим занятиям в расписании. Если это ошибка, обратитесь в деканат.
      </EmptyState>
    );
  }

  const journal = group && discipline ? await getTeacherJournal(ctx, group, discipline, { all }) : null;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Журнал</h1>
        <p className="mt-1 text-muted">{profile.fullName}</p>
      </div>

      {/* Выбор группы и предмета — ссылками (работает без JavaScript) */}
      <nav aria-label="Группа и предмет" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-2 pb-1">
          {classes.map((c) => {
            const active = journal?.groupId === c.groupId && journal?.disciplineId === c.disciplineId;
            return (
              <li key={`${c.groupId}:${c.disciplineId}`}>
                <Link
                  href={journalHref({ group: c.groupId, discipline: c.disciplineId })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 flex-col justify-center rounded-xl px-3.5 py-1.5 text-sm whitespace-nowrap",
                    active ? "bg-primary text-on-primary" : "bg-surface-muted text-text hover:bg-border",
                  )}
                >
                  <span className="font-semibold">{c.groupName}</span>
                  <span className={cn("text-xs", active ? "text-on-primary/90" : "text-muted")}>
                    {c.disciplineName} · занятий: {c.pastLessons}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!journal ? (
        group || discipline ? (
          <EmptyState
            icon={BookOpen}
            title="Журнал не найден"
            action={
              <Link href="/teacher/marks" className={buttonVariants({ variant: "secondary" })}>
                К выбору группы
              </Link>
            }
          >
            Вы не ведёте занятия у этой группы по этому предмету. Выберите группу из списка выше.
          </EmptyState>
        ) : (
          <EmptyState icon={BookOpen} title="Выберите группу и предмет">
            Нажмите на группу в списке выше — откроется журнал: студенты по строкам, ваши занятия по столбцам.
          </EmptyState>
        )
      ) : (
        <JournalView journal={journal} all={all} cell={cell} msg={msg} />
      )}
    </div>
  );
}

function JournalView({ journal, all, cell, msg }: { journal: Journal; all: boolean; cell?: string; msg?: string }) {
  const [cellStudent, cellLesson] = cell?.split(".") ?? [];
  const selected =
    cellStudent && cellLesson && journal.cells[cellStudent]?.[cellLesson]
      ? {
          student: journal.students.find((s) => s.id === cellStudent)!,
          lesson: journal.lessons.find((l) => l.id === cellLesson)!,
          data: journal.cells[cellStudent]![cellLesson]!,
        }
      : null;
  const base = { group: journal.groupId, discipline: journal.disciplineId, all };

  if (journal.lessons.length === 0) {
    return (
      <EmptyState icon={CalendarX} title="Занятий ещё не было">
        В журнале появятся столбцы, когда начнутся ваши занятия у группы {journal.groupName} по предмету «
        {journal.disciplineName}».
      </EmptyState>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 gap-4 xl:gap-6", selected && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
      {selected && (
        <div className="xl:order-2">
          <CellEditor
            journal={journal}
            student={selected.student}
            lesson={selected.lesson}
            data={selected.data}
            back={journalHref({ ...base, cell })}
            close={journalHref(base)}
            msg={msg}
          />
        </div>
      )}

      <Card className="min-w-0 p-0 sm:p-0 xl:order-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <CardTitle className="text-[15px]">
              {journal.groupName} · {journal.disciplineName}
            </CardTitle>
            <p className="text-[13px] text-muted">
              Новые занятия — слева. Нажмите на клетку, чтобы поставить оценку или отметить посещаемость. ✓ — был, оп — опоздал, н — не был.
            </p>
          </div>
          {journal.totalLessons > journal.lessons.length || all ? (
            <Link
              href={journalHref({ ...base, all: !all, cell })}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "min-h-11" })}
            >
              {all ? "Только последние" : `Все занятия (${journal.totalLessons})`}
            </Link>
          ) : null}
        </div>

        {/* Таблица прокручивается внутри карточки, страница — нет. Первая колонка закреплена. */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Журнал: {journal.groupName}, {journal.disciplineName}. Строки — студенты, столбцы — занятия.
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-muted">
                  Студент
                </th>
                {journal.lessons.map((l) => (
                  <th key={l.id} scope="col" className="px-1 py-2 text-center font-medium whitespace-nowrap text-muted">
                    <span className="block text-text">{shortDate(l.date)}</span>
                    <span className="block text-[13px] font-normal" title={`${l.kind}, ${l.start}`}>
                      {l.kind.slice(0, 4)}.
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {journal.students.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-36 bg-surface px-3 py-1 text-left font-medium whitespace-nowrap sm:max-w-none"
                    title={s.name}
                  >
                    <span className="block truncate">{s.shortName}</span>
                  </th>
                  {journal.lessons.map((l) => {
                    const c = journal.cells[s.id]![l.id]!;
                    const isSelected = cellStudent === s.id && cellLesson === l.id;
                    return (
                      <td key={l.id} className="p-0.5 text-center">
                        <Link
                          href={`${journalHref({ ...base, cell: `${s.id}.${l.id}` })}#editor`}
                          aria-label={cellLabel(s.name, l.date, c)}
                          aria-current={isSelected ? "true" : undefined}
                          className={cn(
                            "flex min-h-11 min-w-11 items-center justify-center gap-0.5 rounded-lg px-1 whitespace-nowrap hover:bg-surface-muted",
                            isSelected && "bg-primary-soft ring-2 ring-primary",
                          )}
                        >
                          <CellContent cell={c} />
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function cellLabel(student: string, date: string, c: JournalCell): string {
  const parts = [student, formatDayMonthLong(date)];
  if (c.attendance) parts.push(ATTENDANCE[c.attendance].label.toLowerCase());
  parts.push(c.marks.length ? `оценки: ${c.marks.map((m) => m.value).join(", ")}` : "оценок нет");
  return parts.join(", ");
}

function CellContent({ cell }: { cell: JournalCell }) {
  if (!cell.attendance && cell.marks.length === 0) return <span className="text-muted" aria-hidden>·</span>;
  return (
    <span className="flex flex-nowrap items-center justify-center gap-0.5" aria-hidden>
      {cell.attendance && cell.attendance !== "PRESENT" && (
        <span className={cn("text-[13px] font-semibold", ATTENDANCE[cell.attendance].tone)}>
          {ATTENDANCE[cell.attendance].short}
        </span>
      )}
      {cell.attendance === "PRESENT" && cell.marks.length === 0 && (
        <span className={cn("text-[13px]", ATTENDANCE.PRESENT.tone)}>{ATTENDANCE.PRESENT.short}</span>
      )}
      {cell.marks.map((m) => (
        <MarkBadge key={m.id} value={m.value} size="xs" />
      ))}
    </span>
  );
}

function CellEditor({
  journal,
  student,
  lesson,
  data,
  back,
  close,
  msg,
}: {
  journal: Journal;
  student: Journal["students"][number];
  lesson: Journal["lessons"][number];
  data: JournalCell;
  back: string;
  close: string;
  msg?: string;
}) {
  const hidden = (
    <>
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="lessonId" value={lesson.id} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  return (
    <Card id="editor" className="scroll-mt-28 xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="break-words">{student.name}</CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            {formatDayMonthLong(lesson.date)}, {lesson.start} · {lesson.kind} · {journal.disciplineName}
          </p>
        </div>
        <Link href={close} aria-label="Закрыть" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <X className="size-5" aria-hidden />
        </Link>
      </div>

      {msg && (
        <div className="mt-3">
          <FormMessage type="error">{msg}</FormMessage>
        </div>
      )}

      <section className="mt-4" aria-labelledby="editor-marks">
        <h3 id="editor-marks" className="text-sm font-medium">
          Оценки
        </h3>
        {data.marks.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Оценок на этом занятии нет.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.marks.map((m) => (
              <li key={m.id} className="flex items-center gap-1 rounded-xl bg-surface-muted py-1 pr-1 pl-2">
                <MarkBadge value={m.value} size="sm" />
                {m.own ? (
                  <form action={removeJournalMarkAction}>
                    <input type="hidden" name="markId" value={m.id} />
                    <input type="hidden" name="back" value={back} />
                    <Button type="submit" variant="ghost" size="icon" aria-label={`Удалить оценку ${m.value}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </form>
                ) : (
                  <span className="px-1 text-xs text-muted">деканат</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={addJournalMarkAction} className="mt-3">
          {hidden}
          <p className="mb-1.5 text-sm text-muted">Добавить оценку (можно несколько):</p>
          <div className="grid grid-cols-5 gap-2">
            {MARK_VALUES.map((v) => (
              <Button key={v} type="submit" name="value" value={v} variant="secondary" aria-label={`Поставить ${v}`}>
                <span className="text-[17px] font-semibold tabular-nums">{v}</span>
              </Button>
            ))}
          </div>
        </form>
      </section>

      <section className="mt-5" aria-labelledby="editor-attendance">
        <h3 id="editor-attendance" className="text-sm font-medium">
          Посещаемость
        </h3>
        <form action={setJournalAttendanceAction} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
          {hidden}
          {(Object.keys(ATTENDANCE) as AttendanceStatus[]).map((s) => {
            const active = data.attendance === s;
            return (
              <Button
                key={s}
                type="submit"
                name="status"
                value={s}
                variant={active ? "primary" : "secondary"}
                aria-pressed={active}
              >
                {ATTENDANCE[s].label}
              </Button>
            );
          })}
          <Button type="submit" name="status" value="CLEAR" variant="ghost">
            Снять отметку
          </Button>
        </form>
      </section>
    </Card>
  );
}
