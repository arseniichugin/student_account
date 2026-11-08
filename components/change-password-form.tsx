"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Label } from "@/components/ui/form";
import { changePasswordAction } from "@/lib/auth/actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-3" key={state?.success}>
      <div>
        <Label htmlFor="currentPassword">Текущий пароль</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="newPassword">Новый пароль</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
        <p className="mt-1 text-xs text-muted">Не короче 10 символов.</p>
      </div>
      <div>
        <Label htmlFor="confirmPassword">Повторите новый пароль</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </div>
      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}
      {state?.success && <FormMessage type="success">{state.success}</FormMessage>}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Сохраняем…" : "Изменить пароль"}
      </Button>
    </form>
  );
}
