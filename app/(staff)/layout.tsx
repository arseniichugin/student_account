import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-links";
import { requireStaff } from "@/lib/auth/guards";
import { getMyStaffProfile } from "@/lib/data/profile";

const NAV: NavItem[] = [{ href: "/staff", label: "Заявки", icon: "inbox" }];

export default async function StaffLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireStaff();
  const p = await getMyStaffProfile(ctx);
  const [lastName = "", firstName = ""] = p.fullName.split(" ");

  return (
    <AppShell
      nav={NAV}
      homeHref="/staff"
      user={{
        name: `${firstName} ${lastName}`.trim(),
        meta: `Деканат ${p.faculty.code}`,
        initials: `${firstName[0] ?? ""}${lastName[0] ?? ""}`,
      }}
    >
      {children}
    </AppShell>
  );
}
