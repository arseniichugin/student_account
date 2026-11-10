import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { HOME } from "@/lib/navigation";

/** Корень сайта: отправляет пользователя в его кабинет. */
export default async function Home() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  redirect(HOME[session.user.role]);
}
