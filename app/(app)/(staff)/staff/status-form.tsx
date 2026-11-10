"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import type { RequestStatus } from "@/lib/generated/prisma/enums";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/status";
import { cn } from "@/lib/utils";
import { REQUEST_STATUSES } from "@/lib/validation/requests";
import { updateStatusAction } from "./actions";

const OPTIONS: { value: RequestStatus; label: string }[] = REQUEST_STATUSES.map((value) => ({
  value,
  label: REQUEST_STATUS_LABEL[value],
}));

export function StatusForm({
  requestId,
  status,
  comment,
  title,
}: {
  requestId: string;
  status: RequestStatus;
  comment: string;
  /** Название заявки — чтобы скринридер различал одинаковые формы в списке */
  title: string;
}) {
  const [state, formAction, pending] = useActionState(updateStatusAction, undefined);
  // Форма отправляется через onSubmit, а не через <form action>: в последнем случае
  // React 19 после отправки сбрасывает поля, и выпадающий список показывал старый статус
  // (ошибка найдена на скриншоте при проверке, см. docs/AI_LOG.md).
  const [value, setValue] = useState<RequestStatus>(status);
  const [text, setText] = useState(comment);

  return (
    <form
      className="mt-3 border-t border-border pt-3 @3xl:mt-0 @3xl:border-0 @3xl:pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid grid-cols-1 gap-2">
        <Select
          name="status"
          value={value}
          onChange={(e) => setValue(e.target.value as RequestStatus)}
          aria-label={`Статус: ${title}`}
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Textarea
          name="comment"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Комментарий для студента"
          aria-label={`Комментарий для студента: ${title}`}
          maxLength={500}
          rows={2}
          className="min-h-0"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="justify-self-end">
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
