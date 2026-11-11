import type { LetterCount } from "@/lib/grades/course-stats";
import { scaleEntry } from "@/lib/grades/scale";
import { plural } from "@/lib/utils";

// Распределение студентов по букве итогового балла — собственный SVG без библиотек, как графики студента
// (components/grades/grades-charts.tsx): координаты по горизонтали — в процентах ширины, без viewBox,
// цвета — только токены (--grade-*, --text, --text-muted), поэтому график сам перекрашивается в тёмной теме.

const ROW = 40;
const BAR = 10;
const FONT = 14;

const studentsWord = (n: number) => plural(n, ["студент", "студента", "студентов"]);

/**
 * Горизонтальные столбики: сколько студентов с итоговым баллом каждой буквы (A … F) и «нет оценок».
 * Длина столбика — доля от самой большой группы; число — текстом справа (цвет не единственный признак).
 */
export function LetterDistribution({ distribution, id }: { distribution: LetterCount[]; id: string }) {
  // «Нет оценок» показываем, только если такие студенты есть
  const rows = distribution.filter((r) => r.letter !== null || r.count > 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((n, r) => n + r.count, 0);
  const description = rows
    .map((r) => `${r.letter ?? "нет оценок"} — ${r.count} ${studentsWord(r.count)}`)
    .join("; ");

  return (
    <figure className="m-0">
      <svg role="img" aria-labelledby={`${id}-title ${id}-desc`} width="100%" height={rows.length * ROW} className="block overflow-visible">
        <title id={`${id}-title`}>Студенты по букве итогового балла</title>
        <desc id={`${id}-desc`}>{description}</desc>
        {rows.map((r, i) => {
          const e = r.letter ? scaleEntry(r.letter) : null;
          const top = i * ROW;
          const labelY = top + FONT + 1;
          const barY = labelY + 7;
          const pct = (r.count / max) * 100;
          const share = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <g key={r.letter ?? "none"}>
              <title>{`${r.letter ?? "Нет оценок"}: ${r.count} ${studentsWord(r.count)}`}</title>
              <text x={0} y={labelY} fontSize={FONT} fontWeight={700} className={e ? e.tone.fill : "fill-muted"}>
                {r.letter ?? "Нет оценок"}
                {e && (
                  <tspan fontWeight={400} fontSize={12} className="fill-muted">
                    {`  ${e.min}–${e.max} · ${e.label.split(",")[0]}`}
                  </tspan>
                )}
              </text>
              <text x="100%" y={labelY} textAnchor="end" fontSize={FONT} fontWeight={600} className="fill-text">
                {r.count}
                <tspan fontWeight={400} fontSize={12} className="fill-muted">{` · ${share}%`}</tspan>
              </text>
              <rect x={0} y={barY} width="100%" height={BAR} rx={BAR / 2} className="fill-surface-muted" />
              {r.count > 0 && (
                <rect
                  x={0}
                  y={barY}
                  width={`${Math.max(pct, 1.5)}%`}
                  height={BAR}
                  rx={BAR / 2}
                  style={{ fill: e ? e.cssVar : "var(--text-muted)" }}
                />
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 text-xs text-muted">
        Итоговый балл студента — среднее из средних по дисциплинам, как у студента в «Оценках». Длина столбика — доля
        от самой многочисленной буквы, справа — число студентов и их доля.
      </figcaption>
    </figure>
  );
}
