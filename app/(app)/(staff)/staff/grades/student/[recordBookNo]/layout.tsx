import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { isFacultyStudent } from "@/lib/data/dean-grades";
import { recordBookFromParam } from "@/lib/validation/dean-grades";

/**
 * Студент чужого факультета или несуществующая зачётка → настоящий HTTP 404 (layout выполняется до loading.tsx,
 * как у журнала преподавателя). Страница проверяет сама ещё раз (getFacultyStudentGrades).
 */
export default async function DeanStudentLayout({ children, params }: LayoutProps<"/staff/grades/student/[recordBookNo]">) {
  const ctx = await requireStaff();
  const { recordBookNo } = await params;
  if (!(await isFacultyStudent(ctx, recordBookFromParam(recordBookNo)))) notFound();
  return children;
}
