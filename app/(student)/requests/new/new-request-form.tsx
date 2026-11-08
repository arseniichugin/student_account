"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Label, Select, Textarea } from "@/components/ui/form";
import { createRequestAction } from "../actions";

type RequestTypeOption = { id: string; name: string; description: string; etaDays: number };

export function NewRequestForm({ types }: { types: RequestTypeOption[] }) {
  const [state, formAction, pending] = useActionState(createRequestAction, undefined);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const selected = types.find((t) => t.id === typeId);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="typeId">Что нужно</Label>
        <Select id="typeId" name="typeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        {selected && (
          <p className="mt-1.5 text-sm text-muted">
            {selected.description} Обычно готово за {selected.etaDays} раб. дн.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="destination">Куда предоставить</Label>
        <Input id="destination" name="destination" placeholder="например, по месту работы" maxLength={200} required />
      </div>

      <div>
        <Label htmlFor="copies">Количество экземпляров</Label>
        <Input id="copies" name="copies" type="number" inputMode="numeric" min={1} max={5} defaultValue={1} required />
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
