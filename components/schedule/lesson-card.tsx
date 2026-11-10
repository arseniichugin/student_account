import Link from "next/link";
import { ArrowRightLeft, ExternalLink, MapPin, PlayCircle, Timer, UserRound, UserRoundCog, Users, Video, XCircle } from "lucide-react";
import { MovedAwayCard } from "@/components/schedule/moved-away-card";
import { buttonVariants } from "@/components/ui/button";
import { roomMapHref } from "@/lib/campus-map/links";
import { safeExternalUrl } from "@/lib/safe-url";
import type { ScheduleLesson, ScheduleLessonStatus } from "@/lib/data/schedule";
import type { MovedAwayLesson } from "@/lib/data/schedule-moves";
import { pairLabel } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

// Статус занятия — цветом, иконкой И текстом (не только цветом — ради доступности).
const STATUS: Record<Exclude<ScheduleLessonStatus, "normal">, { label: string; className: string; Icon: typeof XCircle }> = {
  cancelled: { label: "Отменено", className: "bg-danger-soft text-danger", Icon: XCircle },
  moved: { label: "Перенесено", className: "bg-warning-soft text-warning", Icon: ArrowRightLeft },
  replaced: { label: "Замена преподавателя", className: "bg-warning-soft text-warning", Icon: UserRoundCog },
};

type LessonHighlight = { kind: "current" | "next"; label: string };

const badgeBase = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium";

/** «ауд. 1017» для номера, «Манеж-1» — для помещения с названием. */
function roomLabel(room: string): { text: string } {
  return { text: /^\d/.test(room) ? `ауд. ${room}` : room };
}

/**
 * Карточка занятия: время и номер пары, дисциплина, вид работы, преподаватель, группы,
 * аудитория (ссылка на карту) или онлайн-ссылка, статус изменения и его причина.
 *
 * showTeacher — показывать преподавателя (в расписании преподавателя он и так известен);
 * showGroups — показывать группы; по умолчанию только у занятий нескольких групп (поток).
 * headingLevel — уровень заголовка дисциплины: 3 на «Сегодня» и в виде «День», 4 — в «Неделе» (под днём h3).
 */
export function LessonCard({
  lesson: l,
  highlight,
  showTeacher = true,
  showGroups,
  headingLevel = 3,
}: {
  lesson: ScheduleLesson;
  highlight?: LessonHighlight;
  showTeacher?: boolean;
  showGroups?: boolean;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  const cancelled = l.status === "cancelled";
  const status = l.status === "normal" ? null : STATUS[l.status];
  const pair = pairLabel(l.pairStart, l.pairEnd);
  const groupsVisible = (showGroups ?? l.groups.length > 1) && l.groups.length > 0;
  const room = l.room ? roomLabel(l.room) : null;
  const teacherTitle = l.teacher ? [l.teacher.fullName, l.teacher.rank].filter(Boolean).join(", ") : "";
  // Кнопка «Подключиться» — только для http(s): javascript: и прочее в href не попадёт
  const onlineUrl = safeExternalUrl(l.url);

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

        <Heading className={cn("text-[16px] leading-snug font-semibold break-words", cancelled && "text-muted line-through")}>
          {l.discipline}
        </Heading>
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
              aria-label={`${room.text}${l.building ? ` · ${l.building}` : ""} — показать на карте`}
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
          {onlineUrl && !cancelled && (
            <a
              href={onlineUrl}
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
          {!room && !l.isOnline && !onlineUrl && <span className="inline-flex min-h-11 items-center text-sm text-muted">Аудитория не указана</span>}
        </div>
      </div>
    </article>
  );
}

/** Порядок в списке дня: по номеру пары, затем по времени (заглушки переноса — на месте исходной пары). */
function slotKey(x: { pairStart: number | null; start: string | null }): string {
  return `${String(x.pairStart ?? 99).padStart(2, "0")}|${x.start ?? "99:99"}`;
}

/**
 * Список занятий одного дня. timing — отметки «идёт сейчас» / «следующая» (только для сегодня).
 * movedAway — заглушки занятий, перенесённых с этого дня на другой; movedHref — ссылка на день, куда перенесли.
 */
export function LessonList({
  lessons,
  timing,
  showTeacher,
  showGroups,
  columns = false,
  headingLevel = 3,
  movedAway = [],
  movedHref,
}: {
  lessons: ScheduleLesson[];
  timing?: { currentId: string | null; currentLabel: string | null; nextId: string | null; nextLabel: string | null };
  showTeacher?: boolean;
  showGroups?: boolean;
  /** На компьютере — в две колонки (вид «Неделя») */
  columns?: boolean;
  headingLevel?: 3 | 4;
  movedAway?: MovedAwayLesson[];
  movedHref?: (date: string) => string;
}) {
  const items = [
    ...lessons.map((l) => ({ key: slotKey(l), lesson: l, moved: null })),
    ...movedAway.map((m) => ({ key: slotKey(m), lesson: null, moved: m })),
  ].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return (
    <ul className={cn("grid grid-cols-1 gap-3", columns && "lg:grid-cols-2")}>
      {items.map(({ lesson: l, moved }) =>
        moved ? (
          <li key={moved.id}>
            <MovedAwayCard lesson={moved} headingLevel={headingLevel} href={movedHref?.(moved.toDate)} />
          </li>
        ) : (
        <li key={l!.id}>
          <LessonCard
            lesson={l!}
            showTeacher={showTeacher}
            showGroups={showGroups}
            headingLevel={headingLevel}
            highlight={
              timing?.currentId === l!.id
                ? { kind: "current", label: timing.currentLabel ?? "" }
                : timing?.nextId === l!.id
                  ? { kind: "next", label: timing.nextLabel ?? "" }
                  : undefined
            }
          />
        </li>
        ),
      )}
    </ul>
  );
}
