import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarX } from "lucide-react";
import { JournalView } from "@/components/journal/journal-table";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireTeacher } from "@/lib/auth/guards";
import { getTeacherJournal, listTeacherClasses } from "@/lib/data/journal";
import { getMyTeacherProfile } from "@/lib/data/teacher";
import { journalMessage } from "@/lib/validation/journal";
import { firstParam, parseIdParam } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Журнал" };

// Журнал преподавателя: строки — студенты группы, столбцы — его прошедшие занятия по предмету.
// Всё на сервере: выбор группы и клетки — ссылки, сохранение — обычные формы (<form action>),
// поэтому журнал работает и без JavaScript.

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
        <JournalView
          journal={journal}
          all={all}
          cell={cell}
          msg={msg}
          canMarkAttendance
          href={(q) => journalHref({ group: journal.groupId, discipline: journal.disciplineId, ...q })}
        />
      )}
    </div>
  );
}

