"use client";

import { useEffect } from "react";
import { markNotificationsReadAction } from "./actions";

/**
 * Отмечает уведомления прочитанными после того, как страница показана.
 * Новые остаются подсвеченными до следующего открытия — студент видит, что именно пришло.
 */
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) void markNotificationsReadAction();
  }, [unread]);
  return null;
}
