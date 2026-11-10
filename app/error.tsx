"use client"; // Границы ошибок — только клиентские компоненты

import { ErrorScreen } from "@/components/error-screen";

/**
 * Ошибка выше страниц кабинета — в общем layout `app/(app)/layout.tsx` (requireUser, профиль для меню),
 * например при недоступной базе. app/(app)/error.tsx такую ошибку не ловит: граница ошибок сегмента
 * не оборачивает layout того же сегмента. Корневой layout (шрифт, стили, тема) остаётся на месте.
 */
export default function RootSegmentError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
