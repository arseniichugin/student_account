import { LogOut } from "lucide-react";
import Link from "next/link";
import { ConceptBadge } from "@/components/concept-badge";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { logoutAction } from "@/lib/auth/actions";

/**
 * Общая оболочка кабинета: шапка, навигация (снизу на телефоне, сверху на ПК), контент.
 */
export function AppShell({
  nav,
  userLabel,
  homeHref,
  children,
}: {
  nav: NavItem[];
  userLabel: string;
  homeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href={homeHref} aria-label="На главную">
            <Logo />
          </Link>
          <ConceptBadge className="hidden sm:inline-flex" />
          <nav className="ml-6 hidden md:block" aria-label="Основная навигация">
            <NavLinks items={nav} variant="top" />
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden max-w-48 truncate lg:max-w-80 text-sm text-muted sm:block">{userLabel}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-muted hover:text-text"
                aria-label="Выйти"
                title="Выйти"
              >
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </div>
        <div className="px-4 pb-2 sm:hidden">
          <ConceptBadge />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Основная навигация"
      >
        <NavLinks items={nav} variant="bottom" />
      </nav>
    </div>
  );
}
