import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { BookOpen, CheckCircle2, Trash2 } from "lucide-react";
import { JournalView } from "@/components/journal/journal-table";
import { MarkBadge } from "@/components/marks/mark-badge";
import { AutoSubmit } from "@/components/ui/auto-submit";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormMessage, Label, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import { requireStaff, type StaffContext } from "@/lib/auth/guards";
import {
  getJournal,
  listFacultyGroupOptions,
  listGroupDisciplineOptions,
  listGroupStudentOptions,
  type Option,
} from "@/lib/data/journal";
import {
  listGradableDisciplines,
  listGradableLessons,
  listRecentMarks,
} from "@/lib/data/marks";
import { listFacultyCourses } from "@/lib/data/notifications";
import { getMyStaffProfile } from "@/lib/data/profile";
import {
  addJournalMarkAction,
  removeJournalMarkAction,
} from "@/lib/journal/actions";
import { MARK_VALUES } from "@/lib/marks/stats";
import {
  firstParam,
  formatDayMonthLong,
  parseIdParam,
} from "@/lib/schedule/dates";
import { cn, formatDateTime } from "@/lib/utils";
import { journalMessage } from "@/lib/validation/journal";

export const metadata: Metadata = { title: "Ввод оценок" };

// Ввод оценок деканатом — два способа:
//  — «Форма» (по умолчанию): курс → группа → студент → предмет → дата → оценка. Каждый список заполняется
//    на сервере по выбору в предыдущем; без JavaScript — кнопкой «Показать варианты», с JS — сразу.
//  — «Таблица»: курс → группа → предмет, журнал «студенты × занятия» (общий с преподавателем).
// Неподходящие значения из адреса (группа не того курса, чужой студент…) сервер просто отбрасывает.

type Params = Record<string, string | string[] | undefined>;

function href(
  view: "form" | "table",
  q: Record<string, string | undefined | boolean>,
): string {
  const p = new URLSearchParams({ view });
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v === true ? "1" : v);
  return `/staff/marks?${p}`;
}

export default async function StaffMarksPage({
  searchParams,
}: PageProps<"/staff/marks">) {
  const ctx = await requireStaff();
  const sp = await searchParams;
  const view = firstParam(sp.view) === "table" ? "table" : "form";
  const [profile, courses] = await Promise.all([
    getMyStaffProfile(ctx),
    listFacultyCourses(ctx),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">
          Ввод оценок
        </h1>
        <p className="mt-1 text-muted">{profile.faculty.name}</p>
      </div>

      <nav aria-label="Способ ввода" className="flex gap-2">
        {(
          [
            ["form", "Форма"],
            ["table", "Таблица"],
          ] as const
        ).map(([v, label]) => (
          <Link
            key={v}
            href={href(v, {})}
            aria-current={view === v ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
              view === v
                ? "bg-primary text-on-primary"
                : "bg-surface-muted text-muted hover:text-text",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === "form" ? (
        <SearchForm ctx={ctx} sp={sp} courses={courses} />
      ) : (
        <TableView ctx={ctx} sp={sp} courses={courses} />
      )}
    </div>
  );
}

// ─── Форма поиска ───────────────────────────────────────────────────

async function SearchForm({
  ctx,
  sp,
  courses,
}: {
  ctx: StaffContext;
  sp: Params;
  courses: { course: number; students: number }[];
}) {
  // Цепочка выбора: каждое следующее значение принимается, только если оно есть в списке, построенном по предыдущему
  const courseRaw = Number(firstParam(sp.course));
  const course = courses.some((c) => c.course === courseRaw)
    ? courseRaw
    : undefined;
  const groups = course ? await listFacultyGroupOptions(ctx, course) : [];
  const group = pick(groups, sp.group);
  const students = group ? await listGroupStudentOptions(ctx, group) : [];
  const student = pick(students, sp.student);
  const disciplines = student
    ? await listGradableDisciplines(ctx, student)
    : [];
  const discipline = pick(disciplines, sp.discipline);
  const lessons =
    student && discipline
      ? await listGradableLessons(ctx, student, discipline)
      : [];
  const lessonId = pick(lessons, sp.lesson);
  const lesson = lessons.find((l) => l.id === lessonId);
  const msg = journalMessage(firstParam(sp.msg)) ?? undefined;
  const ok = firstParam(sp.ok) === "1";
  const back = href("form", {
    course: course ? String(course) : undefined,
    group,
    student,
    discipline,
    lesson: lessonId,
  });
  const recent = await listRecentMarks(ctx);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-6">
      <Card className="self-start">
        <CardTitle>Новая оценка</CardTitle>
        <p className="mt-0.5 mb-4 text-sm text-muted">
          Выберите по очереди: каждый следующий список заполнится по выбору в
          предыдущем.
        </p>

        <Form
          action="/staff/marks"
          scroll={false}
          replace
          className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2"
        >
          <input type="hidden" name="view" value="form" />
          <AutoSubmit />
          <Field
            label="Курс"
            name="course"
            step={1}
            value={course ? String(course) : ""}
            placeholder="Выберите курс"
            options={courses.map((c) => ({
              id: String(c.course),
              label: `${c.course} курс`,
              meta: `студентов: ${c.students}`,
            }))}
          />
          <Field
            label="Группа"
            name="group"
            step={2}
            value={group ?? ""}
            placeholder={course ? "Выберите группу" : "Сначала выберите курс"}
            options={groups}
            disabled={!course}
          />
          <Field
            label="Студент"
            name="student"
            step={3}
            value={student ?? ""}
            placeholder={
              group ? "Выберите студента" : "Сначала выберите группу"
            }
            options={students}
            disabled={!group}
          />
          <Field
            label="Предмет"
            name="discipline"
            step={4}
            value={discipline ?? ""}
            placeholder={
              student
                ? disciplines.length
                  ? "Выберите предмет"
                  : "Занятий ещё не было"
                : "Сначала выберите студента"
            }
            options={disciplines}
            disabled={!student}
          />
          <Field
            label="Дата занятия"
            name="lesson"
            step={5}
            value={lessonId ?? ""}
            placeholder={
              discipline ? "Выберите занятие" : "Сначала выберите предмет"
            }
            options={lessons}
            disabled={!discipline}
            className="md:col-span-2"
          />
          <div className="md:col-span-2" data-nojs-submit>
            <Button type="submit" variant="secondary">
              Показать варианты
            </Button>
          </div>
        </Form>

        <section
          id="editor"
          className="mt-5 scroll-mt-28 border-t border-border pt-4"
          aria-labelledby="grade-title"
        >
          <h3 id="grade-title" className="text-sm font-medium">
            Оценка
          </h3>
          {ok && (
            <div className="mt-2">
              <FormMessage type="success">
                <CheckCircle2
                  className="mr-1 inline size-4 align-[-3px]"
                  aria-hidden
                />
                Оценка выставлена. Можно поставить ещё одну на этом же занятии
                или выбрать другое.
              </FormMessage>
            </div>
          )}
          {msg && (
            <div className="mt-2">
              <FormMessage type="error">{msg}</FormMessage>
            </div>
          )}
          {!lesson ? (
            <p className="mt-1 text-sm text-muted">
              Кнопки оценок появятся, когда будут выбраны студент, предмет и
              дата.
            </p>
          ) : (
            <>
              {lesson.marks.length > 0 && (
                <ul
                  className="mt-2 flex flex-wrap gap-2"
                  aria-label="Уже выставлено на этом занятии"
                >
                  {lesson.marks.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-1 rounded-xl bg-surface-muted py-1 pr-1 pl-2"
                    >
                      <MarkBadge value={m.value} size="sm" />
                      {m.createdById ? (
                        <form action={removeJournalMarkAction}>
                          <input type="hidden" name="markId" value={m.id} />
                          <input type="hidden" name="back" value={back} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            aria-label={`Удалить оценку ${m.value}`}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </form>
                      ) : (
                        <span className="px-1 text-xs text-muted">
                          преподаватель
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form action={addJournalMarkAction} className="mt-3">
                <input type="hidden" name="studentId" value={student} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <input type="hidden" name="back" value={back} />
                <p className="mb-1.5 text-sm text-muted">
                  Нажмите оценку — она сразу сохранится:
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {MARK_VALUES.map((v) => (
                    <Button
                      key={v}
                      type="submit"
                      name="value"
                      value={v}
                      aria-label={`Поставить ${v}`}
                    >
                      <span className="text-[17px] font-semibold tabular-nums">
                        {v}
                      </span>
                    </Button>
                  ))}
                </div>
              </form>
            </>
          )}
        </section>
      </Card>

      <Card className="self-start">
        <CardTitle>Последние выставленные</CardTitle>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Деканат вашего факультета ещё не выставлял оценок.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <MarkBadge value={m.value} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{m.student}</p>
                  <p className="text-sm break-words text-muted">
                    {m.group} · {m.discipline} · {formatDayMonthLong(m.date)},{" "}
                    {m.start}
                  </p>
                  <p className="text-xs text-muted">
                    Выставлена {formatDateTime(m.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function pick(
  options: Option[],
  raw: string | string[] | undefined,
): string | undefined {
  const id = parseIdParam(firstParam(raw));
  return id && options.some((o) => o.id === id) ? id : undefined;
}

function Field({
  label,
  name,
  step,
  value,
  placeholder,
  options,
  disabled,
  className,
}: {
  label: string;
  name: string;
  step: number;
  value: string;
  placeholder: string;
  options: Option[];
  disabled?: boolean;
  className?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        name={name}
        data-step={step}
        defaultValue={value}
        disabled={disabled}
        key={`${name}:${value}:${options.length}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {o.meta ? ` (${o.meta})` : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}

// ─── Таблица ────────────────────────────────────────────────────────

async function TableView({
  ctx,
  sp,
  courses,
}: {
  ctx: StaffContext;
  sp: Params;
  courses: { course: number; students: number }[];
}) {
  const courseRaw = Number(firstParam(sp.course));
  const course = courses.some((c) => c.course === courseRaw)
    ? courseRaw
    : undefined;
  const groups = course ? await listFacultyGroupOptions(ctx, course) : [];
  const group = pick(groups, sp.group);
  const disciplines = group ? await listGroupDisciplineOptions(ctx, group) : [];
  const discipline = pick(disciplines, sp.discipline);
  const all = firstParam(sp.all) === "1";
  const cell = firstParam(sp.cell)?.slice(0, 140);
  const msg = journalMessage(firstParam(sp.msg)) ?? undefined;
  const journal =
    group && discipline
      ? await getJournal(ctx, group, discipline, { all })
      : null;
  const c = course ? String(course) : undefined;

  return (
    <div className="min-w-0 space-y-4">
      <Pills
        label="Курс"
        items={courses.map((x) => ({
          id: String(x.course),
          label: `${x.course} курс`,
        }))}
        active={c}
        to={(id) => href("table", { course: id })}
      />
      {course && (
        <Pills
          label="Группа"
          items={groups}
          active={group}
          to={(id) => href("table", { course: c, group: id })}
          empty="На этом курсе нет групп со студентами"
        />
      )}
      {group && (
        <Pills
          label="Предмет"
          items={disciplines}
          active={discipline}
          to={(id) => href("table", { course: c, group, discipline: id })}
          empty="У группы ещё не было занятий"
        />
      )}
      {!journal ? (
        <EmptyState icon={BookOpen} title="Выберите курс, группу и предмет">
          Откроется журнал: студенты по строкам, занятия по столбцам. Нажмите на
          клетку, чтобы поставить оценку.
        </EmptyState>
      ) : (
        <JournalView
          journal={journal}
          all={all}
          cell={cell}
          msg={msg}
          canMarkAttendance={false}
          href={(q) =>
            href("table", {
              course: c,
              group,
              discipline,
              all: q.all,
              cell: q.cell,
            })
          }
        />
      )}
    </div>
  );
}

function Pills({
  label,
  items,
  active,
  to,
  empty,
}: {
  label: string;
  items: Option[];
  active?: string;
  to: (id: string) => string;
  empty?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0"
    >
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex gap-2 pb-1">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={to(i.id)}
                aria-current={active === i.id ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap",
                  active === i.id
                    ? "bg-primary text-on-primary"
                    : "bg-surface-muted text-text hover:bg-border",
                )}
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
