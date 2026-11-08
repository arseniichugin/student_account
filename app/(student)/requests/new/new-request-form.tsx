"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { createRequestAction } from "../actions";

type RequestTypeOption = { id: string; name: string; description: string; etaDays: number };

export function NewRequestForm({ types }: { types: RequestTypeOption[] }) {
  const [state, formAction, pending] = useActionState(createRequestAction, undefined);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");

  return (
    <form action={formAction} className="space-y-5">
      {/* Выбор документа карточками: всё видно сразу, без раскрытия списка */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Что нужно</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {types.map((t) => {
            const checked = t.id === typeId;
            return (
              <label
                key={t.id}
                className={cn(
                  "relative flex cursor-pointer flex-col rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                  checked ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="typeId"
                  value={t.id}
                  checked={checked}
                  onChange={() => setTypeId(t.id)}
                  className="sr-only"
                />
                <span className="flex items-start gap-2 pr-6">
                  <span className="text-[15px] font-medium">{t.name}</span>
                </span>
                <span className="mt-1 text-sm text-muted">{t.description}</span>
                <span className="mt-2 text-xs font-medium text-muted">≈ {t.etaDays} раб. дн.</span>
                {checked && <CheckCircle2 className="absolute top-3 right-3 size-5 text-primary" aria-hidden />}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
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
