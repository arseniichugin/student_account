"use client";

import { CalendarDays, FileText, Inbox, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Иконки задаются строкой: серверный компонент не может передать функцию в клиентский.
const ICONS = { sun: Sun, file: FileText, user: UserRound, inbox: Inbox, calendar: CalendarDays };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

const STYLES = {
  bottom: {
    list: "flex",
    item: "flex-1",
    link: "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
    active: "text-primary",
    idle: "text-muted hover:text-text",
    icon: "size-6",
  },
  side: {
    list: "flex flex-col gap-1",
    item: "",
    link: "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium",
    active: "bg-primary-soft text-primary",
    idle: "text-muted hover:bg-surface-muted hover:text-text",
    icon: "size-5",
  },
} as const;

export function NavLinks({ items, variant }: { items: NavItem[]; variant: keyof typeof STYLES }) {
  const pathname = usePathname();
  const s = STYLES[variant];

  return (
    <ul className={s.list}>
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <li key={href} className={s.item}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(s.link, active ? s.active : s.idle)}
            >
              <Icon className={s.icon} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
