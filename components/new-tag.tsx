"use client";

import { useState } from "react";

/**
 * Метка «Новая» / «Статус изменился». Запоминает значение при первом показе: страница сразу отмечает
 * новое просмотренным (кружок в меню пропадает) и сервер присылает её заново уже без «новых», а метка
 * остаётся видна до следующего открытия страницы.
 */
export function NewTag({ show, children, className }: { show: boolean; children: React.ReactNode; className?: string }) {
  const [initial] = useState(show);
  return initial ? <span className={className}>{children}</span> : null;
}

/** Обёртка, выделенная как «новая» по значению при первом показе (см. NewTag). */
export function NewHighlight({
  show,
  className,
  newClassName,
  children,
}: {
  show: boolean;
  className?: string;
  newClassName: string;
  children: React.ReactNode;
}) {
  const [initial] = useState(show);
  return <div className={initial ? `${className ?? ""} ${newClassName}` : className}>{children}</div>;
}
