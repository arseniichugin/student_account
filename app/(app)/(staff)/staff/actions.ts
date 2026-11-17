"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions/errors";
import { requireStaff } from "@/lib/auth/guards";
import { updateFacultyRequestStatus } from "@/lib/data/requests";
import { updateRequestStatusSchema } from "@/lib/validation/requests";

export type StatusFormState = { error?: string; success?: string } | undefined;

export async function updateStatusAction(_prev: StatusFormState, formData: FormData): Promise<StatusFormState> {
  const ctx = await requireStaff();

  const parsed = updateRequestStatusSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) return { error: "Проверьте статус и комментарий" };

  return runAction(
    "updateRequestStatus",
    async () => {
      const updated = await updateFacultyRequestStatus(ctx, parsed.data);
      // Заявка другого факультета → та же реакция, что и на несуществующую.
      if (!updated) return { error: "Заявка не найдена" };
      revalidatePath("/staff");
      revalidatePath("/requests");
      return { success: "Статус обновлён, студент получит уведомление" };
    },
    (error) => ({ error }),
  );
}
