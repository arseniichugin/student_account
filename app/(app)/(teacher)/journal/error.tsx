"use client"; // Границы ошибок — только клиентские компоненты

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Ошибка журнала (список групп или журнал группы): понятный текст, «Повторить» — retry()
 * (заново запросить страницу у сервера), и выход к списку групп. Несохранённые оценки
 * при такой ошибке не теряются молча: страница журнала предупреждает об уходе с несохранёнными.
 */
export default function JournalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card role="alert" className="flex flex-col items-center px-4 py-12 text-center">
      <AlertTriangle className="size-10 text-danger" aria-hidden />
      <h1 className="mt-3 text-[22px] font-bold">Не удалось загрузить журнал</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Проверьте интернет и попробуйте ещё раз. Выставленные ранее оценки сохранены.
      </p>
      {digest && <p className="mt-2 text-xs text-muted">Код ошибки: {digest}</p>}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => retry()}>
          <RotateCw className="size-4" aria-hidden />
          Повторить
        </Button>
        <Link href="/journal" className={buttonVariants({ variant: "ghost" })}>
          Все группы
        </Link>
      </div>
    </Card>
  );
}
