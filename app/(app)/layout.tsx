import { AppShell, type ShellNotifications, type ShellUser } from "@/components/app-shell";
import { requireRecipient, requireStaff, requireStudent, requireTeacher, requireUser } from "@/lib/auth/guards";
import { countMyNewMarks } from "@/lib/data/marks";
import { countMyUnreadNotifications } from "@/lib/data/notifications";
import { getMyStaffProfile, getMyStudentProfile } from "@/lib/data/profile";
import { countMyChangedRequests } from "@/lib/data/requests";
import { getMyTeacherProfile } from "@/lib/data/teacher";
import { HOME, NAV } from "@/lib/navigation";

/**
 * Общая оболочка кабинета для всех ролей: меню выбирается по роли из lib/navigation.ts.
 * Layout только рисует оболочку — права проверяет КАЖДАЯ страница и каждое действие
 * (requireStudent / requireStaff / requireTeacher / requireUser), layout их не защищает.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { role } = await requireUser();
  const user = role === "STUDENT" ? await studentShellUser() : role === "TEACHER" ? await teacherShellUser() : await staffShellUser();

  let nav = NAV[role];
  // Колокольчик — у получателей уведомлений: студента и преподавателя (деканат только отправляет)
  let notifications: ShellNotifications | undefined;
  if (role !== "STAFF") {
    notifications = { href: "/notifications", unread: await countMyUnreadNotifications(await requireRecipient()) };
  }
  if (role === "STUDENT") {
    const ctx = await requireStudent();
    const [newMarks, changedRequests] = await Promise.all([countMyNewMarks(ctx), countMyChangedRequests(ctx)]);
    // Кружки с числом: новые оценки и заявки с изменившимся статусом
    const badges: Record<string, number> = { "/grades": newMarks, "/requests": changedRequests };
    nav = nav.map((item) => (badges[item.href] ? { ...item, badge: badges[item.href] } : item));
  }

  return (
    <AppShell nav={nav} homeHref={HOME[role]} user={user} notifications={notifications}>
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

async function teacherShellUser(): Promise<ShellUser> {
  const p = await getMyTeacherProfile(await requireTeacher());
  const [lastName = "", firstName = "", middleName = ""] = p.fullName.split(" ");
  return {
    name: `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, " ").trim(),
    meta: ["Преподаватель", p.rank].filter(Boolean).join(" · "),
    initials: `${firstName[0] ?? ""}${lastName[0] ?? ""}`,
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
