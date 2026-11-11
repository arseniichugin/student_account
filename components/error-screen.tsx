"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { ConceptBadge } from "@/components/concept-badge";
import { Button } from "@/components/ui/button";

/**
 * Полноэкранная страница ошибки: оболочка кабинета (меню, карточка пользователя) не нарисовалась —
 * например, база данных недоступна и упал общий layout. Её показывают app/error.tsx (ошибка в layout
 * кабинета) и app/global-error.tsx (ошибка в корневом layout). Только токены темы — в тёмной теме тёмная.
 * В продакшене Next.js не передаёт в браузер текст серверной ошибки: показываем код для поиска в логах.
 */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && error.digest ? String(error.digest) : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <ConceptBadge className="mb-6" />
      <div role="alert" className="flex flex-col items-center">
        <AlertTriangle className="size-12 text-danger" aria-hidden />
        <h1 className="mt-4 text-[22px] font-bold">Сервис временно недоступен</h1>
        <p className="mt-2 text-[15px] text-muted">
          Не удалось загрузить страницу: сервер не получил данные. Обычно это проходит за минуту — попробуйте ещё раз.
          Если не помогло — зайдите чуть позже.
        </p>
        {digest && <p className="mt-2 text-xs text-muted">Код ошибки: {digest}</p>}
      </div>
      <Button type="button" className="mt-6" onClick={() => retry()}>
        <RotateCw className="size-4" aria-hidden />
        Повторить
      </Button>
    </main>
  );
}
