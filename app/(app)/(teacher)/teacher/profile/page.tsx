import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardTitle } from "@/components/ui/card";
import { DetailsList } from "@/components/ui/details-list";
import { requireTeacher } from "@/lib/auth/guards";
import { UNIVERSITY_NAME } from "@/lib/config";
import { PASSWORD_CHANGE_LOCK_MESSAGE, getPasswordChangeLock } from "@/lib/data/account";
import { getMyTeacherProfile } from "@/lib/data/grades";

export const metadata: Metadata = { title: "Профиль" };

/**
 * ЗАГЛУШКА (каркас этапа 3): профиль преподавателя. Адрес /teacher/profile, потому что /profile —
 * студенческий (requireStudent). Смена пароля — то же действие и тот же запрет для демо-аккаунтов.
 */
export default async function TeacherProfilePage() {
  const ctx = await requireTeacher();
  const [p, passwordLock] = await Promise.all([getMyTeacherProfile(ctx), getPasswordChangeLock(ctx.userId)]);

  return (
    <div className="space-y-5">
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Профиль</h1>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <Card>
          <p className="text-[17px] font-semibold">{p.fullName}</p>
          <p className="text-sm text-muted">Преподаватель · {UNIVERSITY_NAME}</p>
          <DetailsList
            className="mt-4"
            items={[
              ["Должность", p.rank ?? "—"],
              ["Почта", p.email ?? "—"],
              ["Логин", p.login],
              ["Групп в журнале", String(p.assignmentCount)],
            ]}
          />
        </Card>
        <Card className="self-start">
          <CardTitle>Смена пароля</CardTitle>
          {passwordLock ? (
            <p className="mt-2 text-sm text-muted">
              {PASSWORD_CHANGE_LOCK_MESSAGE[passwordLock]} В настоящем кабинете здесь будет форма смены пароля.
            </p>
          ) : (
            <div className="mt-3">
              <ChangePasswordForm />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
