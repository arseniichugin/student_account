"use server";

import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/guards";
import { createMyRequest } from "@/lib/data/requests";
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

  const created = await createMyRequest(ctx, parsed.data);
  if (!created) return { error: "Такой тип справки не найден" };

  redirect(`/requests/${created.id}?created=1`);
}
