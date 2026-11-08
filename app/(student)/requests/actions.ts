"use server";

import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/guards";
import { MAX_ACTIVE_REQUESTS, MAX_REQUESTS_PER_HOUR, createMyRequest } from "@/lib/data/requests";
import { createRequestSchema } from "@/lib/validation/requests";

export type NewRequestState = { error?: string } | undefined;

export async function createRequestAction(_prev: NewRequestState, formData: FormData): Promise<NewRequestState> {
  // Серверное действие проверяет сессию само: его можно вызвать напрямую, минуя страницу.
  const ctx = await requireStudent();

  const parsed = createRequestSchema.safeParse({
    typeId: formData.get("typeId"),
    destination: formData.get("destination"),
    copies: formData.get("copies"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };

  const result = await createMyRequest(ctx, parsed.data);
  if (!result.ok) {
    const messages = {
      "unknown-type": "Такой тип справки не найден",
      "too-many-active": `У вас уже ${MAX_ACTIVE_REQUESTS} заявок в работе. Дождитесь, пока деканат обработает часть из них.`,
      "too-many-recent": `Можно подать не больше ${MAX_REQUESTS_PER_HOUR} заявок в час. Попробуйте чуть позже.`,
    } as const;
    return { error: messages[result.reason] };
  }

  redirect(`/requests/${result.id}?created=1`);
}
