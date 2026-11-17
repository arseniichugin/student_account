"use server";

import { revalidatePath } from "next/cache";
import { requireRecipient } from "@/lib/auth/guards";
import { markMyNotificationsRead } from "@/lib/data/notifications";

/** Отметить прочитанными все пришедшие уведомления — вызывается, когда студент открыл страницу. */
export async function markNotificationsReadAction(): Promise<void> {
  const ctx = await requireRecipient();
  const changed = await markMyNotificationsRead(ctx);
  // Обновить число на колокольчике в оболочке кабинета
  if (changed > 0) revalidatePath("/", "layout");
}
