import type { Metadata } from "next";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { getMyStudentProfile } from "@/lib/data/profile";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const ctx = await requireStudent();
  const p = await getMyStudentProfile(ctx);
  const fullName = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");

  const rows: [string, string][] = [
    ["Факультет", p.group.program.faculty.name],
    ["Направление", `${p.group.program.code} ${p.group.program.name}`],
    ["Курс", String(p.group.course)],
    ["Группа", p.group.name],
    ["Номер зачётной книжки", p.recordBookNo],
    ["Логин", p.user.login],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] leading-tight font-bold">Профиль</h1>

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
            <p className="text-sm text-muted">Студент · Университет «Горизонт»</p>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="text-[15px] sm:text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardTitle>Смена пароля</CardTitle>
        <div className="mt-3">
          <ChangePasswordForm />
        </div>
      </Card>
    </div>
  );
}
