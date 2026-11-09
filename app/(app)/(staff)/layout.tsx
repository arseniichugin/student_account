import { requireStaff } from "@/lib/auth/guards";

/**
 * Раздел только для сотрудника деканата: студента отправляем на главную (а оттуда — на /today).
 * Дополнительный рубеж: страница и действия сами вызывают requireStaff().
 */
export default async function StaffLayout({ children }: LayoutProps<"/">) {
  await requireStaff();
  return children;
}
