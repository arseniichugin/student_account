"use client";

import { useEffect, useRef } from "react";

/**
 * Список сегментов переключателя семестров, который может прокручиваться вбок (телефон, 4-й курс):
 * после загрузки выбранный семестр (aria-current) прокручивается в видимую часть ряда.
 * Без JavaScript — обычный прокручиваемый список ссылок.
 */
export function SemesterScroller({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = ref.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]')?.parentElement;
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    // Только ряд, не вся страница (scrollIntoView прокрутил бы и окно)
    const left = active.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + active.offsetWidth > list.scrollLeft + list.clientWidth - 32) {
      list.scrollLeft = left - (list.clientWidth - active.offsetWidth) / 2;
    }
  });
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
