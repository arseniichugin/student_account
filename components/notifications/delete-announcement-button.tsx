"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteStaffAnnouncementAction, deleteTeacherAnnouncementAction } from "@/lib/notifications/form-actions";

/** Отменить запланированное или отозвать отправленное событие — только после подтверждения. */
export function DeleteAnnouncementButton({
  id,
  title,
  scheduled,
  mode,
}: {
  id: string;
  title: string;
  scheduled: boolean;
  mode: "staff" | "teacher";
}) {
  const [pending, startTransition] = useTransition();
  const verb = scheduled ? "Отменить отправку" : "Удалить у всех получателей";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={`${verb}: ${title}`}
      title={verb}
      onClick={() => {
        if (!window.confirm(`${verb} «${title}»?`)) return;
        const formData = new FormData();
        formData.set("announcementId", id);
        startTransition(async () => {
          try {
            const result = await (mode === "staff" ? deleteStaffAnnouncementAction : deleteTeacherAnnouncementAction)(formData);
            if (result.error) window.alert(result.error);
          } catch {
            window.alert("Не удалось удалить событие. Проверьте интернет и попробуйте ещё раз.");
          }
        });
      }}
    >
      {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
    </Button>
  );
}
