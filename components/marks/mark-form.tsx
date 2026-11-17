"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { FormMessage } from "@/components/ui/form";
import { MARK_VALUES } from "@/lib/marks/stats";
import { cn } from "@/lib/utils";
import { createMarkAction } from "@/lib/marks/form-actions";

const SUGGEST = "/api/marks/suggest";

/**
 * Ввод оценки: Студент → Предмет → Дата → Оценка.
 * Каждое поле подтягивает до 5 подсказок с сервера; следующее поле открывается, когда выбрано предыдущее.
 * После сохранения студент и предмет остаются — удобно ставить несколько оценок подряд.
 */
export function MarkForm({ emptyStudentText }: { emptyStudentText: string }) {
  const [state, formAction, pending] = useActionState(createMarkAction, undefined);
  const [student, setStudent] = useState<ComboboxItem | null>(null);
  const [discipline, setDiscipline] = useState<ComboboxItem | null>(null);
  const [lesson, setLesson] = useState<ComboboxItem | null>(null);
  const [value, setValue] = useState<number | null>(null);

  // Перерисовываем поле «Дата» после каждой сохранённой оценки: в подсказках обновится «уже: 5, 4»
  const lessonKey = `${student?.id}:${discipline?.id}:${state?.savedAt ?? 0}`;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
        setLesson(null);
        setValue(null);
      }}
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
        <Combobox
          label="Студент"
          name="studentId"
          placeholder="Фамилия, имя или группа"
          minChars={2}
          url={(q) => `${SUGGEST}?${new URLSearchParams({ field: "student", q })}`}
          value={student}
          onChange={(item) => {
            setStudent(item);
            setDiscipline(null);
            setLesson(null);
          }}
          emptyText={emptyStudentText}
        />
        <Combobox
          key={`d:${student?.id}`}
          label="Предмет"
          name="disciplineId"
          placeholder="Начните вводить название"
          url={(q) => (student ? `${SUGGEST}?${new URLSearchParams({ field: "discipline", student: student.id, q })}` : null)}
          value={discipline}
          onChange={(item) => {
            setDiscipline(item);
            setLesson(null);
          }}
          disabledHint="Сначала выберите студента"
          emptyText="У студента не было занятий по такому предмету"
        />
        <Combobox
          key={`l:${lessonKey}`}
          label="Дата занятия"
          name="lessonId"
          placeholder="ДД.ММ — например, 12.11"
          inputMode="numeric"
          url={(q) =>
            student && discipline
              ? `${SUGGEST}?${new URLSearchParams({ field: "lesson", student: student.id, discipline: discipline.id, q })}`
              : null
          }
          value={lesson}
          onChange={setLesson}
          disabledHint="Сначала выберите предмет"
          emptyText="В этот день занятия по предмету не было (или оно ещё не прошло)"
        />
        <fieldset className="min-w-0">
          <legend className="mb-1.5 block text-sm font-medium">Оценка</legend>
          <div className="grid grid-cols-5 gap-2">
            {MARK_VALUES.map((v) => (
              <label key={v} className="relative">
                <input
                  type="radio"
                  name="value"
                  value={v}
                  checked={value === v}
                  onChange={() => setValue(v)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-[17px] font-semibold tabular-nums transition-colors",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
                    value === v
                      ? "border-primary bg-primary text-on-primary"
                      : "border-border bg-surface hover:bg-surface-muted",
                  )}
                >
                  {v}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state?.success && <FormMessage type="success">{state.success}</FormMessage>}

      <Button type="submit" disabled={pending || !student || !lesson || value == null} className="w-full sm:w-auto">
        {pending ? "Сохраняем…" : "Выставить оценку"}
      </Button>
    </form>
  );
}
