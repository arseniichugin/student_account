"use client";

import { useEffect } from "react";

/**
 * Отмечает, что JavaScript кабинета загрузился и React «оживил» страницу (гидратация).
 * Если этого не случилось, встроенный скрипт в app/layout.tsx показывает предупреждение:
 * без JS не работают подсказки, выбор в формах и сохранение (см. docs/AI_LOG.md, 17.11).
 */
export function HydrationCheck() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
    document.getElementById("hydration-warning")?.setAttribute("hidden", "");
  }, []);
  return null;
}
