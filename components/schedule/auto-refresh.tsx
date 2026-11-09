"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Раз в минуту запрашивает страницу у сервера заново, пока вкладка открыта и видна:
 * отметки «Идёт сейчас» и «через 25 мин» считает сервер по московскому времени.
 */
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, everyMs]);
  return null;
}
