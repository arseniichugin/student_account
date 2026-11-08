import { LogOut } from "lucide-react";
import Link from "next/link";
import { ConceptBadge } from "@/components/concept-badge";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { logoutAction } from "@/lib/auth/actions";

export type ShellUser = { name: string; meta: string; initials: string };

/**
 * Оболочка кабинета.
 *  — телефон и планшет (< 1024 px): шапка сверху, навигация снизу;
 *  — компьютер (≥ 1024 px): боковое меню слева с карточкой пользователя.
 */
export function AppShell({
  nav,
  user,
  homeHref,
  children,
}: {
  nav: NavItem[];
  user: ShellUser;
  homeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Боковое меню — только на компьютере. Фон на всю высоту колонки, меню «прилипает» к экрану. */}
      <div className="hidden border-r border-border bg-surface lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col px-4 py-5">
          <Link href={homeHref} aria-label="На главную" className="px-2">
            <Logo />
          </Link>
          <ConceptBadge className="mx-2 mt-3 self-start" />
          <nav className="mt-8" aria-label="Основная навигация">
            <NavLinks items={nav} variant="side" />
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

      <div className="min-w-0 pb-20 lg:pb-0">
        {/* Шапка — телефон и планшет */}
        <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur lg:hidden">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
            <Link href={homeHref} aria-label="На главную">
              <Logo />
            </Link>
            <ConceptBadge className="hidden sm:inline-flex" />
            <div className="ml-auto flex items-center gap-1">
              <span className="hidden max-w-56 truncate text-sm text-muted md:block">
                {user.name} · {user.meta}
              </span>
              <LogoutButton />
            </div>
          </div>
          <div className="px-4 pb-2 sm:hidden">
            <ConceptBadge />
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8 lg:max-w-6xl lg:px-10 lg:py-10">{children}</main>
      </div>

      {/* Нижняя навигация — телефон и планшет */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Основная навигация"
      >
        <NavLinks items={nav} variant="bottom" />
      </nav>
    </div>
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
