import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn } from "lucide-react";
import { MarkBadge } from "@/components/marks/mark-badge";
import { MarkSeen } from "@/components/mark-seen";
import { NewTag } from "@/components/new-tag";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireStudent } from "@/lib/auth/guards";
import { getMyMarksOverview, type MarkItem, type MarksOverview } from "@/lib/data/marks";
import { formatAverage, pluralMarks } from "@/lib/marks/stats";
import { formatDayMonthLong, formatDayShort, formatWeekRange } from "@/lib/schedule/dates";
import { markMarksSeenAction } from "./actions";

export const metadata: Metadata = { title: "Оценки" };

export default async function GradesPage() {
  const ctx = await requireStudent();
  const o = await getMyMarksOverview(ctx);
  const newCount = o.newCount;

  return (
    <div className="space-y-5">
      {/* Есть новые — отмечаем просмотр (кружок в меню пропадает), подсветка остаётся до следующего открытия */}
      <MarkSeen action={markMarksSeenAction} pending={o.newCount > 0} />
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Оценки</h1>
        <p className="mt-1 text-muted">
          <NewTag show={newCount > 0} className="font-medium text-primary">
            Новых оценок: {newCount} ·{" "}
          </NewTag>
          {o.semesterNo} семестр · {formatDayMonthLong(o.semesterFrom)} – {formatDayMonthLong(o.semesterTo)}
        </p>
      </div>

      {o.allTime.count === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="Оценок пока нет"
          action={
            <Link href="/schedule" className={buttonVariants({ variant: "secondary" })}>
              Открыть расписание
            </Link>
          }
        >
          Оценки появятся здесь, как только преподаватель или деканат выставит первую.
        </EmptyState>
      ) : (
        <>
          <StatTiles o={o} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <LastWeek o={o} />
            <div className="space-y-4 lg:space-y-6">
              <SemesterChart o={o} />
              <Distribution o={o} />
            </div>
          </div>
          <ByDiscipline o={o} />
        </>
      )}
    </div>
  );
}

// ─── Три главных числа ──────────────────────────────────────────────

function StatTiles({ o }: { o: MarksOverview }) {
  const tiles = [
    {
      label: "Средний балл за всё обучение",
      value: o.allTime.average,
      note: `${pluralMarks(o.allTime.count)} на занятиях и в ведомостях`,
    },
    {
      label: "Средний балл за семестр",
      value: o.semester.average,
      note: o.semester.count ? pluralMarks(o.semester.count) : "в этом семестре оценок нет",
    },
    {
      label: "За последнюю неделю",
      value: o.lastWeek.average,
      note: o.lastWeek.marks.length ? `${pluralMarks(o.lastWeek.marks.length)} · средний балл` : "оценок не было",
    },
  ];
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
      {tiles.map((t) => (
        <li key={t.label}>
          <Card className="h-full">
            <p className="text-sm text-muted">{t.label}</p>
            <p className="mt-1 text-[32px] leading-none font-bold tabular-nums">{formatAverage(t.value)}</p>
            <p className="mt-2 text-sm text-muted">{t.note}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

// ─── Оценки за последние 7 дней ─────────────────────────────────────

function LastWeek({ o }: { o: MarksOverview }) {
  // Только дни с оценками, новые сверху (marks уже отсортированы по убыванию даты)
  const days: [string, MarkItem[]][] = [];
  for (const m of o.lastWeek.marks) {
    const last = days.at(-1);
    if (last && last[0] === m.date) last[1].push(m);
    else days.push([m.date, [m]]);
  }
  return (
    <Card className="self-start">
      <CardTitle>Оценки за неделю</CardTitle>
      <p className="mt-0.5 text-sm text-muted">{formatWeekRange(o.lastWeek.from, o.lastWeek.to)}</p>
      {days.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          За последние 7 дней оценок не было. Все оценки семестра — ниже, в разделе «По предметам».
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {days.map(([date, marks]) => (
            <section key={date}>
              <h3 className="text-sm font-semibold text-muted">{formatDayShort(date)}</h3>
              <ul className="mt-1 divide-y divide-border">
                {marks.map((m) => (
                  <MarkRow key={m.id} m={m} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

function MarkRow({ m }: { m: MarkItem }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <MarkBadge value={m.value} />
      <div className="min-w-0">
        <p className="font-medium break-words">
          {m.discipline}
          <NewTag
            show={m.isNew}
            className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-xs font-semibold text-on-primary"
          >
            Новая
          </NewTag>
        </p>
        <p className="text-sm text-muted">
          {m.kind} · {m.start}
        </p>
      </div>
    </li>
  );
}

// ─── Средний балл по семестрам (столбцы, шкала 0–5) ─────────────────

function SemesterChart({ o }: { o: MarksOverview }) {
  return (
    <Card>
      <CardTitle id="semester-chart-title">Средний балл по семестрам</CardTitle>
      <div
        role="img"
        aria-labelledby="semester-chart-title"
        aria-describedby="semester-chart-table"
        className="mt-4 flex h-44 items-end gap-2"
      >
        {o.bySemester.map((s) => (
          <div
            key={s.no}
            className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            title={`${s.no} семестр: ${formatAverage(s.average)}${s.count ? ` (${pluralMarks(s.count)})` : ""}`}
          >
            <span className="mb-1 text-xs font-semibold tabular-nums">{formatAverage(s.average)}</span>
            <div
              className={
                "w-full max-w-12 rounded-t-[4px] transition-opacity group-hover:opacity-80 " +
                (s.current ? "bg-primary" : "bg-muted")
              }
              style={{ height: `${((s.average ?? 0) / 5) * 100}%`, minHeight: s.average ? 4 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 border-t border-border pt-1.5" aria-hidden>
        {o.bySemester.map((s) => (
          <span key={s.no} className={"min-w-0 flex-1 text-center text-xs " + (s.current ? "font-semibold" : "text-muted")}>
            {s.no}
            <span className="hidden sm:inline"> сем.</span>
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Шкала от 0 до 5. Синий столбец — текущий семестр, серые — прошлые.</p>
      <table id="semester-chart-table" className="sr-only">
        <caption>Средний балл по семестрам</caption>
        <tbody>
          {o.bySemester.map((s) => (
            <tr key={s.no}>
              <th scope="row">{s.no} семестр</th>
              <td>{formatAverage(s.average)}</td>
              <td>{pluralMarks(s.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Сколько каких оценок в семестре ────────────────────────────────

function Distribution({ o }: { o: MarksOverview }) {
  const total = o.distribution.reduce((a, d) => a + d.count, 0);
  const max = Math.max(1, ...o.distribution.map((d) => d.count));
  return (
    <Card>
      <CardTitle>Оценки на занятиях в семестре</CardTitle>
      {total === 0 ? (
        <p className="mt-2 text-sm text-muted">В этом семестре оценок на занятиях пока нет.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {o.distribution.map((d) => (
            <li key={d.value} className="flex items-center gap-3" title={`«${d.value}»: ${pluralMarks(d.count)}`}>
              <MarkBadge value={d.value} size="sm" />
              <div className="h-3 min-w-0 flex-1 rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(d.count / max) * 100}%`, minWidth: d.count ? 6 : 0 }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                {d.count} <span className="text-muted">· {Math.round((d.count / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── По предметам ───────────────────────────────────────────────────

function ByDiscipline({ o }: { o: MarksOverview }) {
  return (
    <Card>
      <CardTitle>По предметам</CardTitle>
      <p className="mt-0.5 text-sm text-muted">Оценки на занятиях текущего семестра, по порядку</p>
      {o.byDiscipline.length === 0 ? (
        <p className="mt-3 text-sm text-muted">В этом семестре оценок на занятиях пока нет.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {o.byDiscipline.map((d) => (
            <li key={d.name} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-6">
              <div className="flex items-baseline justify-between gap-3 md:block">
                <p className="font-medium break-words">{d.name}</p>
                <p className="shrink-0 text-sm text-muted">
                  ср. <span className="font-semibold text-text tabular-nums">{formatAverage(d.average)}</span>
                </p>
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label={`Оценки: ${d.name}`}>
                {d.marks.map((m) => (
                  <li key={m.id}>
                    <MarkBadge value={m.value} size="sm" title={`${formatDayMonthLong(m.date)}, ${m.start} · ${m.kind}`} />
                    <span className="sr-only">
                      {" "}
                      — {formatDayMonthLong(m.date)}, {m.kind}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
