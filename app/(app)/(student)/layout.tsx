import { requireStudent } from "@/lib/auth/guards";

/**
 * Раздел только для студента: сотрудника отправляем в его кабинет (/staff).
 * Это дополнительный рубеж: каждая страница и действие всё равно вызывает requireStudent() сама —
 * layout не защищает серверные действия и рендерится параллельно со страницей.
 */
export default async function StudentLayout({ children }: LayoutProps<"/">) {
  await requireStudent();
  return children;
}
