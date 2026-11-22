"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/auth/guards";
import { markMyMarksSeen } from "@/lib/data/marks";

/** Студент открыл «Оценки» — убрать кружок с числом новых оценок в меню. */
export async function markMarksSeenAction(): Promise<void> {
  const ctx = await requireStudent();
  await markMyMarksSeen(ctx);
  revalidatePath("/", "layout");
}
