"use client";

import { useEffect } from "react";

/**
 * После показа страницы сообщает серверу «студент увидел новое» (оценки, заявки, уведомления):
 * кружок в меню пропадает, а подсветка новых элементов остаётся до следующего открытия страницы.
 */
export function MarkSeen({ action, pending }: { action: () => Promise<void>; pending: boolean }) {
  useEffect(() => {
    if (pending) void action();
  }, [action, pending]);
  return null;
}
