import type { MyDisciplineGrades } from "@/lib/data/grades";
import { formatPoints, formatScored, scaleEntry, type GradeLetter } from "@/lib/grades/scale";
import { chartFloor, type CheckpointStat } from "@/lib/grades/stats";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { plural } from "@/lib/utils";

// Графики — собственный SVG без библиотек. Координаты по горизонтали — в процентах ширины, без viewBox:
// SVG тянется на всю ширину карточки, а текст остаётся обычного размера (не «раздувается» на компьютере
// и не мельчит на телефоне). Цвета — только токены (--grade-*, --text, --text-muted, --border), поэтому
// графики сами перекрашиваются в тёмной теме.

/** Границы букв, которые рисуем пунктиром: E (зачётный минимум), C, A. */
const THRESHOLDS: { points: number; letter: GradeLetter }[] = (["E", "C", "A"] as const).map((l) => ({
  points: scaleEntry(l).min,
  letter: l,
}));

const MAX_NAME = 34;
const shortName = (s: string) => (s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s);

const AXIS = 22;

/**
 * Горизонтальные столбики: средний балл по каждой дисциплине цветом буквы.
 * Два варианта одной картинки: компактный (телефон) и с более высокими строками (компьютер — колонка
 * рядом со сводкой и динамикой выше, так обе колонки заканчиваются примерно вместе).
 */
export function DisciplineAveragesChart({ disciplines }: { disciplines: MyDisciplineGrades[] }) {
  return (
    <figure className="m-0">
      <div className="lg:hidden">
        <AveragesSvg disciplines={disciplines} row={46} bar={12} font={13} id="chart-avg-m" />
      </div>
      <div className="hidden lg:block">
        <AveragesSvg disciplines={disciplines} row={60} bar={14} font={14} id="chart-avg-d" />
      </div>
      <figcaption className="mt-3 text-xs text-muted">
        Пунктир — границы букв: 60 — E (ниже — FX), 74 — C, 90 — A. Средний считается по выставленным срезам.
      </figcaption>
    </figure>
  );
}

function AveragesSvg({
  disciplines,
  row,
  bar,
  font,
  id,
}: {
  disciplines: MyDisciplineGrades[];
  row: number;
  bar: number;
  font: number;
  id: string;
}) {
  const height = AXIS + disciplines.length * row;
  const description = disciplines
    .map((d) => `${d.discipline} — ${d.average ? formatScored(d.average) : "нет оценок"}`)
    .join("; ");

  return (
    <svg role="img" aria-labelledby={`${id}-title ${id}-desc`} width="100%" height={height} className="block overflow-visible">
      <title id={`${id}-title`}>Средний балл по дисциплинам</title>
      <desc id={`${id}-desc`}>{description}</desc>

      {/* Подписи границ букв над столбиками */}
      {THRESHOLDS.map((t) => (
        <text key={t.letter} x={`${t.points}%`} y={12} textAnchor="middle" fontSize={11} className="fill-muted">
          {t.points}
        </text>
      ))}

      {disciplines.map((d, i) => {
        const top = AXIS + i * row;
        const labelY = top + font + 1;
        const barY = labelY + 8;
        const e = d.average ? scaleEntry(d.average.letter) : null;
        return (
          <g key={d.disciplineId}>
            <title>{`${d.discipline}: ${d.average ? formatScored(d.average) : "нет оценок"}`}</title>
            <text x={0} y={labelY} fontSize={font} className="fill-text">
              {shortName(d.discipline)}
            </text>
            <text x="100%" y={labelY} textAnchor="end" fontSize={font} fontWeight={600} className={e ? e.tone.fill : "fill-muted"}>
              {d.average ? `${d.average.letter} · ${formatPoints(d.average.points)}` : "нет оценок"}
            </text>
            <rect x={0} y={barY} width="100%" height={bar} rx={bar / 2} className="fill-surface-muted" />
            {d.average && e && (
              <rect x={0} y={barY} width={`${d.average.points}%`} height={bar} rx={bar / 2} style={{ fill: e.cssVar }} />
            )}
            {THRESHOLDS.map((t) => (
              <line
                key={t.letter}
                x1={`${t.points}%`}
                x2={`${t.points}%`}
                y1={barY - 4}
                y2={barY + bar + 4}
                strokeWidth={1.5}
                strokeDasharray="3 2"
                className="stroke-muted"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const TREND_H = 200;
const PLOT_TOP = 26;
const PLOT_BOTTOM = TREND_H - 46;
/** Положение срезов по горизонтали (слева место под подписи 60/74/90). */
const X = ["22%", "53%", "84%"] as const;

/**
 * Динамика по срезам: средний балл за 1-й, 2-й, 3-й срез по всем дисциплинам (крупная точка цвета буквы,
 * соединены линией) и баллы отдельных дисциплин (мелкие точки — видно разброс).
 * Средние за срезы считаются по разным наборам дисциплин (1-й — по всем, 2-й — пока по части), поэтому
 * неполный срез — полая точка и пунктир к ней, а под срезом — «по N из M»: рост или падение линии
 * в этом случае — не динамика студента, а другой набор дисциплин.
 */
export function CheckpointTrendChart({ stats }: { stats: CheckpointStat[] }) {
  const floor = chartFloor(stats.flatMap((s) => s.points));
  const y = (p: number) => PLOT_TOP + ((100 - p) / (100 - floor)) * (PLOT_BOTTOM - PLOT_TOP);
  const graded = stats.map((s, i) => ({ ...s, x: X[i]! })).filter((s) => s.average);
  const partial = (s: CheckpointStat) => s.graded < s.total;
  const description = stats
    .map((s) =>
      s.average
        ? `${s.label}: средний ${formatScored(s.average)}, посчитан по ${s.graded} из ${s.total} ${plural(s.total, ["дисциплины", "дисциплин", "дисциплин"])}${partial(s) ? " — срез выставлен не везде" : ""}`
        : `${s.label}: ещё не выставлен`,
    )
    .join("; ");
  const anyPartial = graded.some(partial);
  const gridLines = [...THRESHOLDS.map((t) => t.points), 100].filter((p) => p >= floor);

  return (
    <figure className="m-0">
      <svg role="img" aria-labelledby="chart-trend-title chart-trend-desc" width="100%" height={TREND_H} className="block">
        <title id="chart-trend-title">Средний балл по срезам</title>
        <desc id="chart-trend-desc">{description}</desc>

        {gridLines.map((p) => (
          <g key={p}>
            <text x={0} y={y(p) + 4} fontSize={11} className="fill-muted">
              {p}
            </text>
            <line
              x1={26}
              x2="100%"
              y1={y(p)}
              y2={y(p)}
              strokeWidth={1}
              strokeDasharray={p === 100 ? undefined : "4 3"}
              className={p === 100 ? "stroke-border" : "stroke-muted"}
              opacity={p === 100 ? 1 : 0.6}
            />
          </g>
        ))}

        {/* Линия между выставленными срезами; к неполному срезу — пунктир (другой набор дисциплин) */}
        {graded.slice(1).map((s, i) => (
          <line
            key={s.no}
            x1={graded[i]!.x}
            x2={s.x}
            y1={y(graded[i]!.average!.points)}
            y2={y(s.average!.points)}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={partial(s) || partial(graded[i]!) ? "2 6" : undefined}
            className="stroke-primary"
          />
        ))}

        {stats.map((s, i) => {
          const x = X[i]!;
          const e = s.average ? scaleEntry(s.average.letter) : null;
          return (
            <g key={s.no}>
              {s.points.map((p, k) => (
                <circle key={k} cx={x} cy={y(p)} r={3} className="fill-muted" opacity={0.45} />
              ))}
              {s.average && e ? (
                <>
                  {partial(s) ? (
                    <circle
                      cx={x}
                      cy={y(s.average.points)}
                      r={6}
                      strokeWidth={3}
                      className="fill-surface"
                      style={{ stroke: e.cssVar }}
                    />
                  ) : (
                    <circle cx={x} cy={y(s.average.points)} r={7} strokeWidth={2.5} className="stroke-surface" style={{ fill: e.cssVar }} />
                  )}
                  <text
                    x={x}
                    y={y(s.average.points) - 13}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={700}
                    strokeWidth={4}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    className={`${e.tone.fill} stroke-surface`}
                  >
                    {`${s.average.letter} ${formatPoints(s.average.points)}`}
                  </text>
                </>
              ) : (
                <text x={x} y={PLOT_BOTTOM - 4} textAnchor="middle" fontSize={12} className="fill-muted">
                  ещё нет
                </text>
              )}
              <text x={x} y={TREND_H - 26} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-text">
                {s.label}
              </text>
              <text x={x} y={TREND_H - 10} textAnchor="middle" fontSize={11} className="fill-muted">
                {s.graded > 0 ? `по ${s.graded} из ${s.total}` : `до ${formatDayMonthLong(s.due)}`}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 text-xs text-muted">
        Крупная точка — средний балл за срез, мелкие — отдельные дисциплины. Под срезом — по скольким дисциплинам
        посчитан средний.
        {anyPartial &&
          " Полая точка и пунктир — срез выставлен ещё не по всем дисциплинам: средние посчитаны по разным наборам, сравнивать их рано."}
      </figcaption>
    </figure>
  );
}
