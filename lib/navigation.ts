/**
 * Меню кабинета — единственное место, где перечислены разделы для каждой роли.
 * Используется оболочкой (app/(app)/layout.tsx): боковое меню на компьютере и нижняя панель на телефоне.
 * Скрытый пункт меню — не защита: доступ проверяет сама страница (requireStudent / requireStaff / requireUser).
 * Новый раздел добавить и в matcher proxy.ts — иначе без cookie он не перенаправит сразу на /login.
 * Модуль без серверного и клиентского кода: его импортируют и guards (сервер), и меню (браузер).
 */

export type NavIcon = "sun" | "calendar" | "map" | "file" | "user" | "inbox" | "chart" | "pen" | "bell" | "send";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Число на пункте (непрочитанные уведомления) */
  badge?: number;
};

export type NavRole = "STUDENT" | "STAFF" | "TEACHER";

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
    // «Рассылка», а не «Уведомления»: 6 пунктов на 360 px — длинная подпись обрезалась (как у преподавателя)
    { href: "/staff/notifications", label: "Рассылка", icon: "send" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/map", label: "Карта", icon: "map" },
    { href: "/staff/profile", label: "Профиль", icon: "user" },
  ],
  // Преподаватель: без заявок и справок. Входящие уведомления — колокольчик в шапке (/notifications).
  TEACHER: [
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/teacher/marks", label: "Журнал", icon: "pen" },
    { href: "/teacher/notifications", label: "Рассылка", icon: "send" },
    { href: "/map", label: "Карта", icon: "map" },
    { href: "/teacher/profile", label: "Профиль", icon: "user" },
  ],
};

/** Главная страница кабинета для роли (логотип, корень сайта). */
export const HOME: Record<NavRole, string> = { STUDENT: "/today", STAFF: "/staff", TEACHER: "/schedule" };

/** Профиль роли: данные аккаунта, «О себе», смена пароля. */
export const PROFILE_HREF: Record<NavRole, string> = { STUDENT: "/profile", STAFF: "/staff/profile", TEACHER: "/teacher/profile" };

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
