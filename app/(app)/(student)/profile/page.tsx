import type { Metadata } from "next";
import { AboutCard } from "@/components/profile/about-card";
import { PasswordCard } from "@/components/profile/password-card";
import { ProfileHeader } from "@/components/profile/profile-header";
import { Card } from "@/components/ui/card";
import { DetailsList } from "@/components/ui/details-list";
import { requireStudent, requireUser } from "@/lib/auth/guards";
import { UNIVERSITY_NAME } from "@/lib/config";
import { getMyAbout, getPasswordChangeLock } from "@/lib/data/account";
import { getMyStudentProfile } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const ctx = await requireStudent();
  const user = await requireUser();
  const [p, about, passwordLock] = await Promise.all([
    getMyStudentProfile(ctx),
    getMyAbout(user),
    getPasswordChangeLock(ctx.userId),
  ]);
  const fullName = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");

  return (
    <div className="space-y-5">
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Профиль</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <div className="min-w-0 space-y-4">
          <Card>
            <ProfileHeader initials={`${p.firstName[0]}${p.lastName[0]}`} name={fullName} meta={`Студент · ${UNIVERSITY_NAME}`} />
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
          <AboutCard data={about} />
        </div>

        <PasswordCard lock={passwordLock} />
      </div>
    </div>
  );
}
