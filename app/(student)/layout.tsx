import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-links";
import { requireStudent } from "@/lib/auth/guards";
import { getMyStudentProfile } from "@/lib/data/profile";

// Разделы «Расписание», «Учёба» и «Уведомления» появятся на этапе 3.
const NAV: NavItem[] = [
  { href: "/today", label: "Сегодня", icon: "sun" },
  { href: "/requests", label: "Заявки", icon: "file" },
  { href: "/profile", label: "Профиль", icon: "user" },
];

export default async function StudentLayout({ children }: LayoutProps<"/">) {
  // Защита всего раздела. Каждая страница и действие дополнительно
  // вызывает requireStudent() сама — layout не защищает серверные действия.
  const ctx = await requireStudent();
  const p = await getMyStudentProfile(ctx);

  return (
    <AppShell
      nav={NAV}
      homeHref="/today"
      user={{
        name: `${p.firstName} ${p.lastName}`,
        meta: `${p.group.program.faculty.short} · ${p.group.course} курс · ${p.group.name}`,
        initials: `${p.firstName[0]}${p.lastName[0]}`,
      }}
    >
      {children}
    </AppShell>
  );
}
