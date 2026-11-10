import { ChevronDown, Info } from "lucide-react";
import { GRADE_SCALE } from "@/lib/grades/scale";
import { CHECKPOINTS } from "@/lib/grades/term";
import { formatDayMonthLong } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

/**
 * «Как считаются оценки» — раскрывающаяся подсказка (<details>, работает без JavaScript).
 * Шкала — из GRADE_SCALE (lib/grades/scale.ts): другой вуз поменяет границы там, и подсказка изменится сама.
 */
export function GradingInfo({ className }: { className?: string }) {
  return (
    <details className={cn("group rounded-card border border-border bg-surface", className)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-card px-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <Info className="size-5 shrink-0 text-primary" aria-hidden />
        <h2 className="flex-1 text-[17px] font-semibold">Как считаются оценки</h2>
        <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid grid-cols-1 gap-5 px-4 pb-5 sm:px-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8">
        <table className="w-full border-collapse text-sm">
          <caption className="pb-2 text-left text-muted">Болонская шкала (ECTS): баллы 0–100 → буква</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-2 font-medium">Буква</th>
              <th scope="col" className="py-2 pr-2 font-medium">Баллы</th>
              <th scope="col" className="py-2 pr-2 font-medium">Расшифровка</th>
              <th scope="col" className="py-2 text-right font-medium">
                <span aria-hidden>5-балл.</span>
                <span className="sr-only">По пятибалльной шкале</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {GRADE_SCALE.map((e) => (
              <tr key={e.letter} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-2 text-left">
                  <span className={cn("inline-flex min-w-9 justify-center rounded-lg px-1.5 py-0.5 font-bold", e.tone.bg, e.tone.text)}>
                    {e.letter}
                  </span>
                </th>
                <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
                  {e.min}–{e.max}
                </td>
                <td className="py-2 pr-2">{e.label}</td>
                <td className="py-2 text-right tabular-nums">{e.five}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-3 text-sm">
          <h3 className="text-[15px] font-semibold">Правила</h3>
          <ul className="list-disc space-y-2 pl-5 marker:text-muted">
            <li>
              В семестре три среза: {CHECKPOINTS.map((c) => `${c.label.replace(" срез", "")} — до ${formatDayMonthLong(c.due)}`).join(", ")}.
              За срез ставят баллы от 0 до 100, буква выводится из баллов.
            </li>
            <li>
              <b className="font-semibold">Средний по дисциплине</b> — среднее выставленных срезов. Пустые срезы не считаются
              нулём.
            </li>
            <li>
              <b className="font-semibold">Итоговый балл</b> — «среднее из средних»: средние баллы дисциплин складываются и
              делятся на их число, без весов. Дисциплины без оценок не учитываются.
            </li>
            <li>Экзамен и зачёт в средние не входят — их оценка показана в карточке дисциплины отдельно.</li>
            <li>FX — можно пересдать; F — дисциплину нужно изучить заново.</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
