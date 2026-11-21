"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions/errors";
import { requireUser } from "@/lib/auth/guards";
import { MAX_ABOUT_EDITS_PER_HOUR, MAX_ABOUT_EDITS_PER_HOUR_DEMO, updateMyAbout } from "@/lib/data/account";
import { PROFILE_HREF } from "@/lib/navigation";
import { ABOUT_MAX_LENGTH, aboutSchema } from "@/lib/validation/profile";

export type AboutFormState = { error?: string; success?: string; saved?: string } | undefined;

/**
 * Сохранить «О себе» — любая роль, только своё: guard requireUser() даёт userId из сессии,
 * поля userId в форме нет и не принимается. Работает и без JavaScript (обычная отправка формы).
 */
export async function saveAboutAction(_prev: AboutFormState, formData: FormData): Promise<AboutFormState> {
  const ctx = await requireUser();

  const parsed = aboutSchema.safeParse(formData.get("about") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте текст" };

  return runAction(
    "saveAbout",
    async (): Promise<AboutFormState> => {
      const res = await updateMyAbout(ctx, parsed.data);
      if (!res.ok) {
        if (res.reason === "too-long") return { error: `Не больше ${ABOUT_MAX_LENGTH} символов` };
        return {
          error: `Слишком часто: «О себе» можно сохранять до ${MAX_ABOUT_EDITS_PER_HOUR} раз в час (у тестовых аккаунтов — до ${MAX_ABOUT_EDITS_PER_HOUR_DEMO}). Попробуйте позже.`,
        };
      }
      revalidatePath(PROFILE_HREF[ctx.role]);
      // «О себе» преподавателя видно в его расписании
      if (ctx.role === "TEACHER") revalidatePath("/schedule");
      return { success: res.about ? "Сохранено" : "Текст удалён", saved: res.about ?? "" };
    },
    (error) => ({ error }),
  );
}
