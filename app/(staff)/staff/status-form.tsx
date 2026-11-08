"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import type { RequestStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { updateStatusAction } from "./actions";

const OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: "SUBMITTED", label: "Подана" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "READY", label: "Готова" },
  { value: "ISSUED", label: "Выдана" },
  { value: "REJECTED", label: "Отклонена" },
];

export function StatusForm({ requestId, status, comment }: { requestId: string; status: RequestStatus; comment: string }) {
  const [state, formAction, pending] = useActionState(updateStatusAction, undefined);
  // Форма отправляется через onSubmit, а не через <form action>: в последнем случае
  // React 19 после отправки сбрасывает поля, и выпадающий список показывал старый статус
  // (ошибка найдена на скриншоте при проверке, см. docs/AI_LOG.md).
  const [value, setValue] = useState<RequestStatus>(status);
  const [text, setText] = useState(comment);

  return (
    <form
      className="mt-3 border-t border-border pt-3 lg:mt-0 lg:border-0 lg:pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto]">
        <Select name="status" value={value} onChange={(e) => setValue(e.target.value as RequestStatus)} aria-label="Новый статус">
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input name="comment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Комментарий для студента" aria-label="Комментарий для студента" maxLength={500} className="lg:order-3 lg:col-span-2" />
        <Button type="submit" variant="secondary" disabled={pending} className="lg:order-2">
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
      {state && (
        <p role="status" className={cn("mt-2 text-sm", state.error ? "text-danger" : "text-success")}>
          {state.error ?? state.success}
        </p>
      )}
    </form>
  );
}
