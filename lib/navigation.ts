/**
 * Меню кабинета — единственное место, где перечислены разделы для каждой роли.
 * Используется оболочкой (app/(app)/layout.tsx): боковое меню на компьютере и нижняя панель на телефоне.
 * Скрытый пункт меню — не защита: доступ проверяет сама страница (requireStudent / requireStaff / requireUser).
 */

export type NavIcon = "sun" | "calendar" | "map" | "file" | "user" | "inbox";

export type NavItem = { href: string; label: string; icon: NavIcon };

export type NavRole = "STUDENT" | "STAFF";

export const NAV: Record<NavRole, NavItem[]> = {
  STUDENT: [
    { href: "/today", label: "Сегодня", icon: "sun" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/map", label: "Карта", icon: "map" },
    { href: "/requests", label: "Заявки", icon: "file" },
    { href: "/profile", label: "Профиль", icon: "user" },
  ],
  STAFF: [
    { href: "/staff", label: "Заявки", icon: "inbox" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/map", label: "Карта", icon: "map" },
  ],
};

/** Главная страница кабинета для роли (логотип, корень сайта). */
export const HOME: Record<NavRole, string> = { STUDENT: "/today", STAFF: "/staff" };

/** Активен ли пункт меню для текущего адреса: сам раздел или его подстраницы. */
export function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
