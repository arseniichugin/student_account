"use client";

import { useEffect, useRef } from "react";

/**
 * Помещается внутрь формы выбора (GET). С JavaScript: изменение списка (`select[data-step]`) сразу отправляет
 * форму, а списки следующих шагов (data-step больше) сбрасываются — например, смена курса очищает группу,
 * студента, предмет и дату. Кнопка «Показать варианты» (`[data-nojs-submit]`) при этом прячется.
 * Без JavaScript ничего не происходит: пользователь нажимает эту кнопку, сервер сам отбросит
 * неподходящие значения.
 */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    form.querySelector<HTMLElement>("[data-nojs-submit]")?.setAttribute("hidden", "");
    const onChange = (e: Event) => {
      const target = e.target as HTMLSelectElement;
      const step = Number(target.dataset.step);
      if (!target.matches("select[data-step]") || Number.isNaN(step)) return;
      form.querySelectorAll<HTMLSelectElement>("select[data-step]").forEach((s) => {
        if (Number(s.dataset.step) > step) s.value = "";
      });
      form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
