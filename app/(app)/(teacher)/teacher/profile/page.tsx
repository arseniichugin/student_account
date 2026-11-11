import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, NotebookPen } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardTitle } from "@/components/ui/card";
import { DetailsList } from "@/components/ui/details-list";
import { requireTeacher } from "@/lib/auth/guards";
import { UNIVERSITY_NAME } from "@/lib/config";
import { PASSWORD_CHANGE_LOCK_MESSAGE, getPasswordChangeLock } from "@/lib/data/account";
import { getMyTeacherProfile } from "@/lib/data/grades";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Профиль" };

/**
 * Профиль преподавателя. Адрес /teacher/profile, потому что /profile — студенческий (requireStudent).
 * Смена пароля — то же действие changePasswordAction (работает по сессии, для любой роли) и тот же запрет
 * для демо-аккаунтов и DEMO_MODE: форма скрыта, а действие отклоняет запрос на сервере.
 */
export default async function TeacherProfilePage() {
  const ctx = await requireTeacher();
  const [p, passwordLock] = await Promise.all([getMyTeacherProfile(ctx), getPasswordChangeLock(ctx.userId)]);
  const initials = `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`;
  const groups = `${p.assignmentCount} ${plural(p.assignmentCount, ["группа", "группы", "групп"])}`;

  return (
    <div className="space-y-5">
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Профиль</h1>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex items-center gap-4">
              <div
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-primary"
                aria-hidden
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold break-words">{p.fullName}</p>
                <p className="text-sm text-muted">Преподаватель · {UNIVERSITY_NAME}</p>
              </div>
            </div>
            <DetailsList
              className="mt-4"
              items={[
                ["Должность", p.rank ?? "не указана в расписании"],
                ["Почта", p.email ?? "—"],
                ["Логин", p.login],
                ["Групп в журнале", p.assignmentCount > 0 ? groups : "нет — вы не ведёте семинары"],
              ]}
            />
          </Card>
          {p.assignmentCount > 0 && (
            <Link
              href="/journal"
              className="flex min-h-14 items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 transition-colors hover:border-primary"
            >
              <NotebookPen className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Журнал</span>
                <span className="block text-sm text-muted">{groups} · выставить оценки за срезы и итоговую</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
            </Link>
          )}
        </div>
        <Card className="self-start">
          <CardTitle>Смена пароля</CardTitle>
          {/* Демо-режим стенда или тестовый аккаунт (isDemo): форма скрыта, действие отклоняется на сервере */}
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
