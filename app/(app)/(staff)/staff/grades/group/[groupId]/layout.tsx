import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { isFacultyGroup } from "@/lib/data/dean-grades";

/**
 * Группа чужого факультета, языковая, несуществующая или мусорный id → настоящий HTTP 404.
 * Проверка — здесь: layout выполняется ДО границы загрузки (loading.tsx этого сегмента), а после того
 * как «скелетон» ушёл в браузер, статус ответа уже не поменять. Поэтому выше по дереву (staff/, staff/grades/)
 * своих loading.tsx нет — они лежат в группах (requests) и (overview). Страница проверяет сама ещё раз.
 */
export default async function DeanGroupLayout({ children, params }: LayoutProps<"/staff/grades/group/[groupId]">) {
  const ctx = await requireStaff();
  const { groupId } = await params;
  if (!(await isFacultyGroup(ctx, groupId))) notFound();
  return children;
}
