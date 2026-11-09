import { AppShell, type ShellUser } from "@/components/app-shell";
import { requireStaff, requireStudent, requireUser } from "@/lib/auth/guards";
import { getMyStaffProfile, getMyStudentProfile } from "@/lib/data/profile";
import { HOME, NAV } from "@/lib/navigation";

/**
 * Общая оболочка кабинета для обеих ролей: меню выбирается по роли из lib/navigation.ts.
 * Layout только рисует оболочку — права проверяет КАЖДАЯ страница и каждое действие
 * (requireStudent / requireStaff / requireUser), layout их не защищает.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { role } = await requireUser();
  const user = role === "STUDENT" ? await studentShellUser() : await staffShellUser();

  return (
    <AppShell nav={NAV[role]} homeHref={HOME[role]} user={user}>
      {children}
    </AppShell>
  );
}

async function studentShellUser(): Promise<ShellUser> {
  const p = await getMyStudentProfile(await requireStudent());
  return {
    name: `${p.firstName} ${p.lastName}`,
    meta: `${p.faculty.code} · ${p.course} курс · ${p.academicGroup.name}`,
    initials: `${p.firstName[0]}${p.lastName[0]}`,
  };
}

async function staffShellUser(): Promise<ShellUser> {
  const p = await getMyStaffProfile(await requireStaff());
  const [lastName = "", firstName = ""] = p.fullName.split(" ");
  return {
    name: `${firstName} ${lastName}`.trim(),
    meta: `Деканат ${p.faculty.code}`,
    initials: `${firstName[0] ?? ""}${lastName[0] ?? ""}`,
  };
}
