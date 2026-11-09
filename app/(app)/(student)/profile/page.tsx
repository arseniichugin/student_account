import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardTitle } from "@/components/ui/card";
import { DetailsList } from "@/components/ui/details-list";
import { requireStudent } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/config";
import { getMyStudentProfile } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const ctx = await requireStudent();
  const p = await getMyStudentProfile(ctx);
  const fullName = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");

  return (
    <div className="space-y-5">
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Профиль</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-primary"
              aria-hidden
            >
              {p.firstName[0]}
              {p.lastName[0]}
            </div>
            <div>
              <p className="text-[17px] font-semibold">{fullName}</p>
              <p className="text-sm text-muted">Студент · Хогвартс</p>
            </div>
          </div>
          <DetailsList
            className="mt-4"
            items={[
              ["Факультет", p.faculty.name],
              ["Направление", p.program.name],
              ["Курс", String(p.course)],
              ["Академическая группа", p.academicGroup.name],
              ["Языковые группы", p.languageGroups.join(", ") || "—"],
              ["Номер зачётной книжки", p.recordBookNo],
              ["Почта", p.email],
              ["Логин", p.user.login],
            ]}
          />
        </Card>

        <Card className="self-start">
          <CardTitle>Смена пароля</CardTitle>
          {isDemoMode() ? (
            <p className="mt-2 text-sm text-muted">
              В демо-версии смена пароля отключена: тестовыми аккаунтами пользуются все посетители,
              в том числе жюри. В настоящем кабинете здесь будет форма смены пароля.
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
