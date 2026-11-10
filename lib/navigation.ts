/**
 * Меню кабинета — единственное место, где перечислены разделы для каждой роли.
 * Используется оболочкой (app/(app)/layout.tsx): боковое меню на компьютере и нижняя панель на телефоне.
 * Скрытый пункт меню — не защита: доступ проверяет сама страница
 * (requireStudent / requireStaff / requireTeacher / requireUser).
 * Новый раздел добавить и в matcher proxy.ts — иначе без cookie он не перенаправит сразу на /login.
 * Модуль без серверного и клиентского кода: его импортируют и guards (сервер), и меню (браузер).
 */

export type NavIcon = "sun" | "calendar" | "grades" | "map" | "file" | "user" | "inbox" | "journal";

export type NavItem = { href: string; label: string; icon: NavIcon };

export type NavRole = "STUDENT" | "STAFF" | "TEACHER";

export const NAV: Record<NavRole, NavItem[]> = {
  STUDENT: [
    { href: "/today", label: "Сегодня", icon: "sun" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/grades", label: "Оценки", icon: "grades" },
    { href: "/map", label: "Карта", icon: "map" },
    { href: "/requests", label: "Заявки", icon: "file" },
    { href: "/profile", label: "Профиль", icon: "user" },
  ],
  STAFF: [
    { href: "/staff", label: "Заявки", icon: "inbox" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/map", label: "Карта", icon: "map" },
  ],
  // Профиль преподавателя — /teacher/profile: адрес /profile занят студенческим профилем (requireStudent).
  TEACHER: [
    { href: "/journal", label: "Журнал", icon: "journal" },
    { href: "/schedule", label: "Расписание", icon: "calendar" },
    { href: "/map", label: "Карта", icon: "map" },
    { href: "/teacher/profile", label: "Профиль", icon: "user" },
  ],
};

/** Главная страница кабинета для роли (логотип, корень сайта). */
export const HOME: Record<NavRole, string> = { STUDENT: "/today", STAFF: "/staff", TEACHER: "/journal" };

/** Активен ли пункт меню для текущего адреса: сам раздел или его подстраницы. */
export function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
