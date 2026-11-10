import { requireTeacher } from "@/lib/auth/guards";

/**
 * Раздел только для преподавателя (журнал, профиль преподавателя): студента и сотрудника деканата
 * отправляем в их кабинет. Дополнительный рубеж: страницы и действия сами вызывают requireTeacher().
 */
export default async function TeacherLayout({ children }: LayoutProps<"/">) {
  await requireTeacher();
  return children;
}
