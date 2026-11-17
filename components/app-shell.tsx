import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import { ConceptBadge } from "@/components/concept-badge";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import type { NavItem } from "@/lib/navigation";
import { logoutAction } from "@/lib/auth/actions";
import { UNIVERSITY_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

export type ShellUser = { name: string; meta: string; initials: string };

/** Колокольчик уведомлений (только у студента): куда ведёт и сколько непрочитанных. */
export type ShellNotifications = { href: string; unread: number };

/**
 * Оболочка кабинета.
 *  — телефон и планшет (< 1024 px): шапка сверху, навигация снизу;
 *  — компьютер (≥ 1024 px): боковое меню слева с карточкой пользователя.
 */
export function AppShell({
  nav,
  user,
  homeHref,
  notifications,
  children,
}: {
  nav: NavItem[];
  user: ShellUser;
  homeHref: string;
  notifications?: ShellNotifications;
  children: React.ReactNode;
}) {
  const showBottomNav = nav.length > 1;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Боковое меню — только на компьютере. Фон на всю высоту колонки, меню «прилипает» к экрану. */}
      <div className="hidden border-r border-border bg-surface lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col px-4 py-5">
          <Link href={homeHref} aria-label={`${UNIVERSITY_NAME} — на главную`} className="inline-flex min-h-11 items-center px-2">
            <Logo />
          </Link>
          <ConceptBadge className="mx-2 mt-3 self-start" />
          <nav className="mt-8" aria-label="Основная навигация">
            {/* У студента в боковом меню — ещё «Уведомления» с числом непрочитанных (в нижней панели места нет: там колокольчик в шапке) */}
            <NavLinks
              items={
                notifications
                  ? [...nav, { href: notifications.href, label: "Уведомления", icon: "bell", badge: notifications.unread }]
                  : nav
              }
              variant="side"
            />
          </nav>
          <div className="mt-auto flex items-center gap-3 rounded-2xl bg-surface-muted p-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
              aria-hidden
            >
              {user.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug font-medium break-words">{user.name}</span>
              <span className="block text-xs leading-snug text-muted">{user.meta}</span>
            </span>
            <LogoutButton />
          </div>
        </aside>
      </div>

      <div className={cn("min-w-0 lg:pb-0", showBottomNav && "pb-20")}>
        {/* Шапка — телефон и планшет */}
        <header data-shell-overlay="top" className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur lg:hidden">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
            <Link href={homeHref} aria-label={`${UNIVERSITY_NAME} — на главную`} className="inline-flex min-h-11 items-center">
              <Logo />
            </Link>
            <ConceptBadge className="hidden sm:inline-flex" />
            <div className="ml-auto flex items-center gap-1">
              <span className="hidden max-w-56 truncate text-sm text-muted md:block">{user.name}</span>
              {notifications && <BellButton {...notifications} />}
              <LogoutButton />
            </div>
          </div>
          <div className="px-4 pb-2 sm:hidden">
            <ConceptBadge />
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8 lg:max-w-6xl lg:px-10 lg:py-10">{children}</main>
      </div>

      {/* Нижняя навигация — телефон и планшет; из одного пункта она бесполезна */}
      {showBottomNav && (
        <nav
          data-shell-overlay="bottom"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          aria-label="Основная навигация"
        >
          <NavLinks items={nav} variant="bottom" />
        </nav>
      )}
    </div>
  );
}

function BellButton({ href, unread }: ShellNotifications) {
  return (
    <Link
      href={href}
      aria-label={unread > 0 ? `Уведомления: непрочитанных ${unread}` : "Уведомления"}
      title="Уведомления"
      className="relative flex size-11 items-center justify-center rounded-xl text-muted hover:bg-border/60 hover:text-text"
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span
          className="absolute top-1.5 right-1 min-w-[18px] rounded-full bg-primary px-1 text-center text-[11px] leading-[18px] font-semibold text-on-primary"
          aria-hidden
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-border/60 hover:text-text"
        aria-label="Выйти"
        title="Выйти"
      >
        <LogOut className="size-5" />
      </button>
    </form>
  );
}
