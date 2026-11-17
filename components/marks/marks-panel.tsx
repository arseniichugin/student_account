import { MarkBadge } from "@/components/marks/mark-badge";
import { DeleteMarkButton } from "@/components/marks/delete-mark-button";
import { MarkForm } from "@/components/marks/mark-form";
import { Card, CardTitle } from "@/components/ui/card";
import type { RecentMark } from "@/lib/data/marks";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { formatDateTime } from "@/lib/utils";

/** Экран ввода оценок — общий для деканата и преподавателя: форма и последние выставленные. */
export function MarksPanel({
  title,
  subtitle,
  hint,
  emptyStudentText,
  emptyRecentText,
  recent,
}: {
  title: string;
  subtitle: string;
  hint: string;
  emptyStudentText: string;
  emptyRecentText: string;
  recent: RecentMark[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">{title}</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6">
        <Card className="self-start">
          <CardTitle>Новая оценка</CardTitle>
          <p className="mt-0.5 mb-4 text-sm text-muted">{hint}</p>
          <MarkForm emptyStudentText={emptyStudentText} />
        </Card>

        <Card className="self-start">
          <CardTitle>Последние выставленные</CardTitle>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{emptyRecentText}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <MarkBadge value={m.value} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{m.student}</p>
                    <p className="text-sm break-words text-muted">
                      {m.group} · {m.discipline} · {formatDayMonthLong(m.date)}, {m.start}
                    </p>
                    <p className="text-xs text-muted">Выставлена {formatDateTime(m.createdAt)}</p>
                  </div>
                  <DeleteMarkButton markId={m.id} label={`оценку ${m.value}: ${m.student}, ${m.discipline}`} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
