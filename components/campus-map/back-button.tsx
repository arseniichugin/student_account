"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

/**
 * Пришли ли на карту из кабинета (тогда history.back() вернёт туда, а не уведёт с сайта):
 *  — переход внутри приложения: документ загружался по другому адресу, а карта открыта без перезагрузки;
 *  — или обычный переход с другой страницы этого же сайта (кроме входа).
 */
function cameFromCabinet(): boolean {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const here = window.location.pathname;
  const firstPath = nav ? new URL(nav.name).pathname : here;
  if (firstPath !== here) return true;
  if (!document.referrer) return false;
  try {
    const ref = new URL(document.referrer);
    return ref.origin === window.location.origin && ref.pathname !== here && ref.pathname !== "/login";
  } catch {
    return false;
  }
}

/** «← Назад» (туда, откуда пришли: «Сегодня», расписание, заявка) — только если на карту пришли из кабинета; на сервере кнопки нет. */
export function BackToScheduleButton() {
  const visible = useSyncExternalStore(subscribe, cameFromCabinet, () => false);
  if (!visible) return null;
  return (
    <Button type="button" variant="ghost" size="sm" className="-ml-3 min-h-11" onClick={() => window.history.back()}>
      <ArrowLeft className="size-4" aria-hidden />
      Назад
    </Button>
  );
}
