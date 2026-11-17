/**
 * Меню кабинета — единственное место, где перечислены разделы для каждой роли.
 * Используется оболочкой (app/(app)/layout.tsx): боковое меню на компьютере и нижняя панель на телефоне.
 * Скрытый пункт меню — не защита: доступ проверяет сама страница (requireStudent / requireStaff / requireUser).
 * Новый раздел добавить и в matcher proxy.ts — иначе без cookie он не перенаправит сразу на /login.
 * Модуль без серверного и клиентского кода: его импортируют и guards (сервер), и меню (браузер).
 */

export type NavIcon = "sun" | "calendar" | "map" | "file" | "user" | "inbox" | "chart" | "pen";

export type NavItem = { href: string; label: string; icon: NavIcon };

export type NavRole = "STUDENT" | "STAFF";

export const NAV: Record<NavRole, NavItem[]> = {
  STUDENT: [
    { href: "/today", label: "Сегодня", icon: "sun" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/map", label: "Карта", icon: "map" },
    { href: "/grades", label: "Оценки", icon: "chart" },
    { href: "/requests", label: "Заявки", icon: "file" },
    { href: "/profile", label: "Профиль", icon: "user" },
  ],
  STAFF: [
    { href: "/staff", label: "Заявки", icon: "inbox" },
    { href: "/staff/marks", label: "Оценки", icon: "pen" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/map", label: "Карта", icon: "map" },
  ],
};

/** Главная страница кабинета для роли (логотип, корень сайта). */
export const HOME: Record<NavRole, string> = { STUDENT: "/today", STAFF: "/staff" };

/** Подходит ли пункт меню к адресу: сам раздел или его подстраницы. */
export function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Какой пункт меню подсветить: самый точный из подходящих.
 * На /staff/marks подходят и «/staff», и «/staff/marks» — активен только второй.
 */
export function activeNavHref(items: readonly NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    if (isNavActive(href, pathname) && (!best || href.length > best.length)) best = href;
  }
  return best;
}
