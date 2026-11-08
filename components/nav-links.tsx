"use client";

import { CalendarDays, FileText, Inbox, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Иконки задаются строкой: серверный компонент не может передать функцию в клиентский.
const ICONS = { sun: Sun, file: FileText, user: UserRound, inbox: Inbox, calendar: CalendarDays };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "top" | "bottom" }) {
  const pathname = usePathname();

  return (
    <ul className={cn(variant === "bottom" ? "flex" : "flex gap-1")}>
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <li key={href} className={cn(variant === "bottom" && "flex-1")}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                variant === "bottom"
                  ? "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
                  : "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium",
                active
                  ? variant === "bottom"
                    ? "text-primary"
                    : "bg-primary-soft text-primary"
                  : "text-muted hover:text-text",
              )}
            >
              <Icon className={variant === "bottom" ? "size-6" : "size-4"} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
