"use client";

import { startTransition, useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Label, Textarea } from "@/components/ui/form";
import { cn, workDays } from "@/lib/utils";
import { createRequestAction } from "../actions";

type RequestTypeOption = { id: string; name: string; description: string; etaDays: number };

export function NewRequestForm({ types }: { types: RequestTypeOption[] }) {
  const [state, formAction, pending] = useActionState(createRequestAction, undefined);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");

  return (
    // onSubmit вместо <form action>: React 19 после ответа сервера сбрасывает форму, и после ошибки
    // выделенной оставалась одна справка, а отправилась бы другая (найдено ui-reviewer).
    <form
      className="@container space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      {/* Выбор документа карточками: всё видно сразу, без раскрытия списка */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Что нужно</legend>
        <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
          {types.map((t) => {
            const checked = t.id === typeId;
            return (
              <label
                key={t.id}
                className={cn(
                  "relative flex cursor-pointer flex-col rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                  checked ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="typeId"
                  value={t.id}
                  checked={checked}
                  onChange={() => setTypeId(t.id)}
                  aria-labelledby={`type-${t.id}-name`}
                  aria-describedby={`type-${t.id}-desc`}
                  className="sr-only"
                />
                <span id={`type-${t.id}-name`} className="pr-7 text-[15px] font-medium">
                  {t.name}
                </span>
                <span id={`type-${t.id}-desc`} className="mt-1 text-sm text-muted">
                  {t.description} <span className="mt-2 block text-xs font-medium">Обычно {workDays(t.etaDays)}</span>
                </span>
                {checked ? (
                  <CheckCircle2 className="absolute top-3 right-3 size-5 text-primary" aria-hidden />
                ) : (
                  <span className="absolute top-3.5 right-3.5 size-4 rounded-full border-2 border-muted/50" aria-hidden />
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 @md:grid-cols-[minmax(0,1fr)_140px]">
        <div>
          <Label htmlFor="destination">Куда предоставить</Label>
          <Input id="destination" name="destination" placeholder="например, по месту работы" maxLength={200} required />
        </div>
        <div>
          <Label htmlFor="copies">Экземпляров</Label>
          <Input id="copies" name="copies" type="number" inputMode="numeric" min={1} max={5} defaultValue={1} required />
        </div>
      </div>

      <div>
        <Label htmlFor="comment">Комментарий для деканата (необязательно)</Label>
        <Textarea id="comment" name="comment" maxLength={500} />
      </div>

      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}

      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {pending ? "Отправляем…" : "Отправить заявку"}
      </Button>
    </form>
  );
}
