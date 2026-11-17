"use client";

import { CalendarDays, ChartColumn, FileText, Inbox, MapPinned, NotebookPen, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref, type NavIcon, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// Иконки задаются строкой: серверный компонент не может передать функцию в клиентский.
const ICONS: Record<NavIcon, typeof Sun> = {
  sun: Sun,
  calendar: CalendarDays,
  map: MapPinned,
  file: FileText,
  user: UserRound,
  inbox: Inbox,
  chart: ChartColumn,
  pen: NotebookPen,
};

const STYLES = {
  bottom: {
    list: "flex",
    item: "min-w-0 flex-1",
    // 6 пунктов на 360 px — по 60 px: подпись 10 px со сжатым трекингом, чтобы «Расписание» помещалось целиком
    link: "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0 text-[10px] font-medium tracking-[-0.02em] min-[400px]:text-[11px] min-[400px]:tracking-normal",
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
  const activeHref = activeNavHref(items, pathname);

  return (
    <ul className={s.list}>
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = href === activeHref;
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
