"use client";

import { useId, useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";
import type { TeacherAssignment } from "@/lib/data/grades";
import { checkpointLabel, FINAL_KIND_LABEL, type CheckpointNo } from "@/lib/grades/term";
import { cn, plural } from "@/lib/utils";
import { AssignmentCard, cardGridClass, isCheckpointIncomplete } from "./assignment-card";

/** С какого числа карточек показывать поиск и фильтры. */
const FILTER_FROM = 7;

const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
    active ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text hover:bg-surface-muted",
  );

/** Нормализуем запрос: регистр, «ё», пробелы и дефисы не важны («1гр1» найдёт «1-ГР-1»). */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[\s\-–—()]/g, "");

/**
 * Список карточек «Мои группы»: поиск по группе, фильтр по курсу и «не заполнен идущий срез»
 * (когда групп много), группировка по дисциплине (когда дисциплин несколько).
 */
export function JournalGroups({
  assignments,
  currentCheckpoint,
}: {
  assignments: TeacherAssignment[];
  currentCheckpoint: CheckpointNo | null;
}) {
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState<number | null>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const searchId = useId();

  const courses = useMemo(
    () => [...new Set(assignments.map((a) => a.group.course).filter((c): c is number => c !== null))].sort((a, b) => a - b),
    [assignments],
  );
  const showFilters = assignments.length >= FILTER_FROM;
  const currentName = currentCheckpoint ? checkpointLabel(currentCheckpoint) : "итоговая";

  const shown = assignments.filter(
    (a) =>
      (!query.trim() || norm(`${a.group.name} ${a.discipline.name}`).includes(norm(query))) &&
      (course === null || a.group.course === course) &&
      (!onlyIncomplete || isCheckpointIncomplete(a, currentCheckpoint)),
  );

  // Группировка по дисциплине: заголовок h2 у каждой (и у единственной — чтобы было видно, что за предмет)
  const disciplines = [...new Map(assignments.map((a) => [a.discipline.id, a.discipline.name])).entries()];
  const sections = disciplines
    .map(([id, name]) => ({ id, name, items: shown.filter((a) => a.discipline.id === id) }))
    .filter((s) => s.items.length > 0);

  const reset = () => {
    setQuery("");
    setCourse(null);
    setOnlyIncomplete(false);
  };
  const filtered = query.trim() !== "" || course !== null || onlyIncomplete;

  return (
    <div className="space-y-5">
      {showFilters && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <label htmlFor={searchId} className="sr-only">
              Найти группу
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти группу, например 1-ГР-1"
              autoComplete="off"
              className="pl-11"
            />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Фильтр групп">
            <button type="button" className={chipClass(course === null)} aria-pressed={course === null} onClick={() => setCourse(null)}>
              Все курсы
            </button>
            {courses.map((c) => (
              <button key={c} type="button" className={chipClass(course === c)} aria-pressed={course === c} onClick={() => setCourse(course === c ? null : c)}>
                {c} курс
              </button>
            ))}
            <button
              type="button"
              className={chipClass(onlyIncomplete)}
              aria-pressed={onlyIncomplete}
              onClick={() => setOnlyIncomplete((v) => !v)}
            >
              {currentCheckpoint ? `${checkpointLabel(currentCheckpoint)} не заполнен` : `${FINAL_KIND_LABEL.EXAM} / ${FINAL_KIND_LABEL.CREDIT.toLowerCase()} не заполнены`}
            </button>
          </div>
          <p className="text-sm text-muted" aria-live="polite">
            {filtered
              ? `Показано ${shown.length} из ${assignments.length} ${plural(assignments.length, ["группы", "групп", "групп"])}`
              : `${assignments.length} ${plural(assignments.length, ["группа", "группы", "групп"])}`}
          </p>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ничего не нашлось"
          action={
            <Button type="button" variant="secondary" onClick={reset}>
              Сбросить фильтры
            </Button>
          }
        >
          {onlyIncomplete ? `Во всех подходящих группах ${currentName} уже заполнен.` : "Проверьте название группы, например «1-ГР-1»."}
        </EmptyState>
      ) : (
        sections.map((s) => (
          <section key={s.id} aria-labelledby={`d-${s.id}`} className="space-y-3">
            <h2 id={`d-${s.id}`} className="text-[22px] leading-tight font-semibold break-words">
              {s.name}
              <span className="ml-2 text-[15px] font-normal text-muted">
                {s.items.length} {plural(s.items.length, ["группа", "группы", "групп"])}
              </span>
            </h2>
            <ul className={cardGridClass}>
              {s.items.map((a) => (
                <li key={a.id} className="min-w-0">
                  <AssignmentCard assignment={a} currentCheckpoint={currentCheckpoint} showDiscipline={false} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
