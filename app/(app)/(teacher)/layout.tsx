import { requireTeacher } from "@/lib/auth/guards";

/**
 * Раздел только для преподавателя. Дополнительный рубеж: каждая страница и действие
 * всё равно вызывает requireTeacher() сама (layout не защищает серверные действия).
 */
export default async function TeacherLayout({ children }: LayoutProps<"/">) {
  await requireTeacher();
  return children;
}
