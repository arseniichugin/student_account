import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav-links";
import { requireStaff } from "@/lib/auth/guards";
import { getMyStaffProfile } from "@/lib/data/profile";

const NAV: NavItem[] = [{ href: "/staff", label: "Заявки", icon: "inbox" }];

export default async function StaffLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireStaff();
  const profile = await getMyStaffProfile(ctx);

  return (
    <AppShell nav={NAV} homeHref="/staff" userLabel={`${profile.fullName} · деканат ${profile.faculty.short}`}>
      {children}
    </AppShell>
  );
}
