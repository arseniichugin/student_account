import type { Metadata } from "next";
import { AboutCard } from "@/components/profile/about-card";
import { PasswordCard } from "@/components/profile/password-card";
import { ProfileHeader } from "@/components/profile/profile-header";
import { Card } from "@/components/ui/card";
import { DetailsList } from "@/components/ui/details-list";
import { requireStaff, requireUser } from "@/lib/auth/guards";
import { UNIVERSITY_NAME } from "@/lib/config";
import { getMyAbout, getPasswordChangeLock } from "@/lib/data/account";
import { getMyStaffProfile } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Профиль" };

/** Профиль сотрудника деканата: данные аккаунта, «О себе», смена пароля. */
export default async function StaffProfilePage() {
  const ctx = await requireStaff();
  const user = await requireUser();
  const [p, about, passwordLock] = await Promise.all([
    getMyStaffProfile(ctx),
    getMyAbout(user),
    getPasswordChangeLock(ctx.userId),
  ]);
  const [lastName = "", firstName = ""] = p.fullName.split(" ");

  return (
    <div className="space-y-5">
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Профиль</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <div className="min-w-0 space-y-4">
          <Card>
            <ProfileHeader
              initials={`${firstName[0] ?? ""}${lastName[0] ?? ""}`}
              name={p.fullName}
              meta={`Сотрудник деканата · ${UNIVERSITY_NAME}`}
            />
            <DetailsList
              className="mt-4"
              items={[
                ["Роль", "Сотрудник деканата"],
                ["Должность", p.position],
                ["Факультет", p.faculty.name],
                ["Логин", p.user.login],
              ]}
            />
          </Card>
          <AboutCard data={about} note="Этот текст видите только вы." />
        </div>

        <PasswordCard lock={passwordLock} />
      </div>
    </div>
  );
}
