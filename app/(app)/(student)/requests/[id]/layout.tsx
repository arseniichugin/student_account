import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth/guards";
import { isMyRequest } from "@/lib/data/requests";

/**
 * Чужая, несуществующая или мусорная заявка → настоящий HTTP 404.
 * Проверка — здесь, а не только в странице: layout выполняется ДО границы загрузки (loading.tsx),
 * а после того как «скелетон» ушёл в браузер, статус ответа уже не поменять (был бы 200).
 * Поэтому у сегмента requests нет своего loading.tsx — он лежит в группе (list) у списка заявок.
 * Страница всё равно ищет заявку только среди своих (getMyRequest) — двойной рубеж.
 */
export default async function RequestLayout({ children, params }: LayoutProps<"/requests/[id]">) {
  const ctx = await requireStudent();
  const { id } = await params;
  if (!(await isMyRequest(ctx, id))) notFound();
  return children;
}
