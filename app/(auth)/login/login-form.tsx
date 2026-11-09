"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Label } from "@/components/ui/form";
import { loginAction } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="login">Логин</Label>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state?.login}
          placeholder="например, ivan.petrov26"
          required
        />
      </div>

      <div>
        <Label htmlFor="password">Пароль</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="pr-12"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-text"
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
          >
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>

      {state?.error && <FormMessage type="error">{state.error}</FormMessage>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {pending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
