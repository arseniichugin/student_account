import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardTitle } from "@/components/ui/card";
import { PASSWORD_CHANGE_LOCK_MESSAGE, type PasswordChangeLock } from "@/lib/data/account";

/**
 * Смена пароля в профиле любой роли. Демо-режим стенда или тестовый аккаунт (isDemo):
 * вместо формы — объяснение; действие changePasswordAction отклоняет такой запрос и само.
 */
export function PasswordCard({ lock }: { lock: PasswordChangeLock | null }) {
  return (
    <Card className="self-start">
      <CardTitle>Смена пароля</CardTitle>
      {lock ? (
        <p className="mt-2 text-sm text-muted">
          {PASSWORD_CHANGE_LOCK_MESSAGE[lock]} В настоящем кабинете здесь будет форма смены пароля.
        </p>
      ) : (
        <div className="mt-3">
          <ChangePasswordForm />
        </div>
      )}
    </Card>
  );
}
