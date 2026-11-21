"use client";

import { startTransition, useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormMessage, Label, Textarea } from "@/components/ui/form";
import { saveAboutAction } from "@/lib/profile/actions";
import { cn } from "@/lib/utils";
import { ABOUT_MAX_LENGTH } from "@/lib/validation/profile";

/**
 * Форма «О себе» под раскрывающимся <details>: работает и без JavaScript.
 * С JS отправка идёт через onSubmit + startTransition: обычный <form action> в React 19
 * сбросил бы поле к старому тексту (см. CLAUDE.md). Без JS — обычная отправка формы,
 * сервер вернёт ту же страницу с сообщением, и блок будет раскрыт (open при наличии ответа).
 */
export function AboutForm({ initial, empty }: { initial: string; empty: boolean }) {
  const [state, formAction, pending] = useActionState(saveAboutAction, undefined);
  const [text, setText] = useState(initial);
  // После сохранения показываем текст так, как его сохранил сервер (без пробелов по краям)
  const [syncedState, setSyncedState] = useState(state);
  if (state !== syncedState) {
    setSyncedState(state);
    if (state?.saved !== undefined) setText(state.saved);
  }

  return (
    <details className="mt-3" open={state ? true : undefined}>
      <summary
        className={cn(
          buttonVariants({ variant: empty ? "primary" : "secondary" }),
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        {empty ? "Рассказать о себе" : "Изменить"}
      </summary>
      <form
        // action — запасной путь без JavaScript; с JS отправку ведёт onSubmit
        action={formAction}
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(() => formAction(formData));
        }}
      >
        <div>
          <Label htmlFor="about">Текст о себе</Label>
          <Textarea
            id="about"
            name="about"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={ABOUT_MAX_LENGTH}
            rows={6}
            aria-describedby="about-hint"
            placeholder="Например: чем занимаетесь, как с вами связаться, о чём можно спросить"
          />
          <p id="about-hint" className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
            <span>Обычный текст, переводы строк сохраняются. Пустое поле — удалить текст.</span>
            <span>
              {text.length} / {ABOUT_MAX_LENGTH}
            </span>
          </p>
        </div>
        {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
        {state?.success && <FormMessage type="success">{state.success}</FormMessage>}
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </form>
    </details>
  );
}
