"use client";

import { CalendarDays, FileText, GraduationCap, Inbox, MapPinned, NotebookPen, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, type NavIcon, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// Иконки задаются строкой: серверный компонент не может передать функцию в клиентский.
const ICONS: Record<NavIcon, typeof Sun> = {
  sun: Sun,
  calendar: CalendarDays,
  grades: GraduationCap,
  map: MapPinned,
  file: FileText,
  user: UserRound,
  inbox: Inbox,
  journal: NotebookPen,
};

const STYLES = {
  bottom: {
    list: "flex",
    // flex-auto, а не flex-1: длинная подпись («Расписание») берёт чуть больше места, короткие — меньше.
    // Так 6 пунктов студента помещаются на 360 px без обрезки; min-w-11 — область нажатия не уже 44 px.
    item: "min-w-11 flex-auto",
    link: "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-medium",
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
        const active = isNavActive(href, pathname);
        return (
          <li key={href} className={s.item}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(s.link, active ? s.active : s.idle)}
            >
              <Icon className={s.icon} aria-hidden />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
