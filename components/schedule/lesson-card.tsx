import Link from "next/link";
import { ArrowRightLeft, ExternalLink, MapPin, PlayCircle, Timer, UserRound, UserRoundCog, Users, Video, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { roomMapHref } from "@/lib/campus-map/links";
import type { ScheduleLesson, ScheduleLessonStatus } from "@/lib/data/schedule";
import { pairLabel } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

// Статус занятия — цветом, иконкой И текстом (не только цветом — ради доступности).
const STATUS: Record<Exclude<ScheduleLessonStatus, "normal">, { label: string; className: string; Icon: typeof XCircle }> = {
  cancelled: { label: "Отменено", className: "bg-danger-soft text-danger", Icon: XCircle },
  moved: { label: "Перенесено", className: "bg-warning-soft text-warning", Icon: ArrowRightLeft },
  replaced: { label: "Замена преподавателя", className: "bg-warning-soft text-warning", Icon: UserRoundCog },
};

export type LessonHighlight = { kind: "current" | "next"; label: string };

const badgeBase = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium";

/** «ауд. 1017» для номера, «Манеж-1» — для помещения с названием. */
function roomLabel(room: string): { text: string; spoken: string } {
  return /^\d/.test(room) ? { text: `ауд. ${room}`, spoken: `аудиторию ${room}` } : { text: room, spoken: room };
}

/**
 * Карточка занятия: время и номер пары, дисциплина, вид работы, преподаватель, группы,
 * аудитория (ссылка на карту) или онлайн-ссылка, статус изменения и его причина.
 *
 * showTeacher — показывать преподавателя (в расписании преподавателя он и так известен);
 * showGroups — показывать группы; по умолчанию только у занятий нескольких групп (поток).
 */
export function LessonCard({
  lesson: l,
  highlight,
  showTeacher = true,
  showGroups,
}: {
  lesson: ScheduleLesson;
  highlight?: LessonHighlight;
  showTeacher?: boolean;
  showGroups?: boolean;
}) {
  const cancelled = l.status === "cancelled";
  const status = l.status === "normal" ? null : STATUS[l.status];
  const pair = pairLabel(l.pairStart, l.pairEnd);
  const groupsVisible = (showGroups ?? l.groups.length > 1) && l.groups.length > 0;
  const room = l.room ? roomLabel(l.room) : null;
  const teacherTitle = l.teacher ? [l.teacher.fullName, l.teacher.rank].filter(Boolean).join(", ") : "";

  return (
    <article
      className={cn(
        "flex h-full gap-3 rounded-card border bg-surface p-4",
        highlight?.kind === "current" ? "border-primary ring-1 ring-primary" : "border-border",
      )}
      aria-label={`${l.start}–${l.end}, ${l.discipline}${status ? `, ${status.label.toLowerCase()}` : ""}`}
    >
      <div className="w-12 shrink-0 tabular-nums">
        <p className={cn("text-[15px] font-semibold", cancelled && "text-muted line-through")}>{l.start}</p>
        <p className={cn("text-sm text-muted", cancelled && "line-through")}>{l.end}</p>
        {pair && <p className="mt-1 text-xs text-muted">{pair}</p>}
      </div>

      <div className="min-w-0 flex-1">
        {(highlight || status) && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {highlight?.kind === "current" && (
              <span className={cn(badgeBase, "bg-primary text-on-primary")}>
                <PlayCircle className="size-3.5" aria-hidden />
                Идёт сейчас · {highlight.label}
              </span>
            )}
            {highlight?.kind === "next" && (
              <span className={cn(badgeBase, "bg-primary-soft text-primary")}>
                <Timer className="size-3.5" aria-hidden />
                Следующая · {highlight.label}
              </span>
            )}
            {status && (
              <span className={cn(badgeBase, status.className)}>
                <status.Icon className="size-3.5" aria-hidden />
                {status.label}
              </span>
            )}
          </div>
        )}

        <h3 className={cn("text-[16px] leading-snug font-semibold break-words", cancelled && "text-muted line-through")}>
          {l.discipline}
        </h3>
        <p className="text-sm text-muted">{l.kind}</p>

        {l.note && (
          <p className={cn("mt-1 text-sm font-medium break-words", cancelled ? "text-danger" : "text-warning")}>{l.note}</p>
        )}

        <div className="mt-1.5 space-y-0.5 text-sm">
          {showTeacher && l.teacher && (
            <p className="flex items-start gap-1.5">
              <UserRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span title={teacherTitle} className="min-w-0 break-words">
                <span aria-hidden="true">{l.teacher.shortName}</span>
                <span className="sr-only">Преподаватель: {teacherTitle}</span>
              </span>
            </p>
          )}
          {groupsVisible && (
            <p className="flex items-start gap-1.5">
              <Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 break-words">
                <span className="sr-only">Группы: </span>
                {l.groups.map((g) => g.name).join(", ")}
              </span>
            </p>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {room && (
            <Link
              href={roomMapHref(l.room!)}
              aria-label={`Показать ${room.spoken} на карте`}
              title={l.buildingAddress ?? undefined}
              className="-mx-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary-soft"
            >
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">
                {room.text}
                {l.building && <span className="font-normal text-muted"> · {l.building}</span>}
              </span>
            </Link>
          )}
          {l.isOnline && (
            <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium">
              <Video className="size-4 text-muted" aria-hidden />
              Онлайн
            </span>
          )}
          {l.url && !cancelled && (
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              title={l.urlDescription ?? undefined}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "min-h-11" })}
            >
              Подключиться
              <ExternalLink className="size-4" aria-hidden />
              <span className="sr-only">(откроется в новой вкладке)</span>
            </a>
          )}
          {!room && !l.isOnline && !l.url && <span className="inline-flex min-h-11 items-center text-sm text-muted">Аудитория не указана</span>}
        </div>
      </div>
    </article>
  );
}

/** Список занятий одного дня. timing — отметки «идёт сейчас» / «следующая» (только для сегодня). */
export function LessonList({
  lessons,
  timing,
  showTeacher,
  showGroups,
  columns = false,
}: {
  lessons: ScheduleLesson[];
  timing?: { currentId: string | null; currentLabel: string | null; nextId: string | null; nextLabel: string | null };
  showTeacher?: boolean;
  showGroups?: boolean;
  /** На компьютере — в две колонки (вид «Неделя») */
  columns?: boolean;
}) {
  return (
    <ul className={cn("grid grid-cols-1 gap-3", columns && "lg:grid-cols-2")}>
      {lessons.map((l) => (
        <li key={l.id}>
          <LessonCard
            lesson={l}
            showTeacher={showTeacher}
            showGroups={showGroups}
            highlight={
              timing?.currentId === l.id
                ? { kind: "current", label: timing.currentLabel ?? "" }
                : timing?.nextId === l.id
                  ? { kind: "next", label: timing.nextLabel ?? "" }
                  : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}
