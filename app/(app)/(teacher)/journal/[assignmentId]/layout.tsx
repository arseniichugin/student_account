import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth/guards";
import { isMyAssignment } from "@/lib/data/grades";

/**
 * Чужой, несуществующий или мусорный assignmentId → настоящий HTTP 404.
 * Проверка — здесь, а не только в странице: layout выполняется ДО границы загрузки (loading.tsx),
 * а после того как «скелетон» ушёл в браузер, статус ответа уже не поменять (был бы 200).
 * Поэтому у сегмента journal нет своего loading.tsx — он лежит в группе (list) у списка журналов.
 * Страница всё равно проверяет сама (getJournal) — двойной рубеж.
 */
export default async function JournalGroupLayout({ children, params }: LayoutProps<"/journal/[assignmentId]">) {
  const ctx = await requireTeacher();
  const { assignmentId } = await params;
  if (!(await isMyAssignment(ctx, assignmentId))) notFound();
  return children;
}
