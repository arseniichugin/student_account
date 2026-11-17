"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteMarkAction } from "@/lib/marks/form-actions";

/** Удаление оценки — только после подтверждения: одно случайное касание не должно стирать оценку. */
export function DeleteMarkButton({ markId, label }: { markId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={`Удалить ${label}`}
      onClick={() => {
        if (!window.confirm(`Удалить ${label}?`)) return;
        const formData = new FormData();
        formData.set("markId", markId);
        startTransition(async () => {
          try {
            const result = await deleteMarkAction(formData);
            if (result.error) window.alert(result.error);
          } catch {
            window.alert("Не удалось удалить оценку. Проверьте интернет и попробуйте ещё раз.");
          }
        });
      }}
    >
      {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
    </Button>
  );
}
