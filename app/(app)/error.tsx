"use client"; // Границы ошибок — только клиентские компоненты

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Ошибка на любой странице кабинета (оболочка с меню остаётся на месте).
 * В продакшене Next.js не передаёт в браузер текст серверной ошибки — показываем понятное сообщение
 * и код для поиска в логах (digest). «Повторить» — retry(): заново запросить страницу у сервера.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card role="alert" className="flex flex-col items-center px-4 py-12 text-center">
      <AlertTriangle className="size-10 text-danger" aria-hidden />
      <h1 className="mt-3 text-[22px] font-bold">Не удалось загрузить страницу</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Проверьте интернет и попробуйте ещё раз. Если не помогло — попробуйте через минуту.
      </p>
      {digest && <p className="mt-2 text-xs text-muted">Код ошибки: {digest}</p>}
      <Button type="button" variant="secondary" className="mt-5" onClick={() => retry()}>
        <RotateCw className="size-4" aria-hidden />
        Повторить
      </Button>
    </Card>
  );
}
