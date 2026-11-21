import type { Metadata } from "next";
import Link from "next/link";
import { AboutCard } from "@/components/profile/about-card";
import { PasswordCard } from "@/components/profile/password-card";
import { ProfileHeader } from "@/components/profile/profile-header";
import { Card } from "@/components/ui/card";
import { DetailsList } from "@/components/ui/details-list";
import { requireTeacher, requireUser } from "@/lib/auth/guards";
import { UNIVERSITY_NAME } from "@/lib/config";
import { getMyAbout, getPasswordChangeLock } from "@/lib/data/account";
import { getMyTeacherProfile } from "@/lib/data/teacher";

export const metadata: Metadata = { title: "Профиль" };

/** Профиль преподавателя: данные аккаунта, дисциплины и группы, «О себе» (его видят студенты в расписании), смена пароля. */
export default async function TeacherProfilePage() {
  const ctx = await requireTeacher();
  const user = await requireUser();
  const [p, about, passwordLock] = await Promise.all([
    getMyTeacherProfile(ctx),
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
              meta={`${["Преподаватель", p.rank].filter(Boolean).join(" · ")} · ${UNIVERSITY_NAME}`}
            />
            <DetailsList
              className="mt-4"
              items={[
                ["Роль", "Преподаватель"],
                ["Звание", p.rank ?? "—"],
                ["Дисциплины", p.disciplines.join(", ") || "—"],
                [`Группы (${p.groups.length})`, p.groups.map((g) => g.name).join(", ") || "—"],
                ["Почта", p.email ?? "—"],
                ["Логин", p.login],
              ]}
            />
          </Card>
          <AboutCard
            data={about}
            note={
              <>
                Текст видят студенты и деканат на странице вашего расписания.{" "}
                <Link href={`/schedule?teacher=${encodeURIComponent(p.id)}`} className="inline-flex min-h-11 items-center font-medium text-primary">
                  Как это выглядит
                </Link>
              </>
            }
          />
        </div>

        <PasswordCard lock={passwordLock} />
      </div>
    </div>
  );
}
