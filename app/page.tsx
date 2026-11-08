import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";

/** Корень сайта: отправляет пользователя в его кабинет. */
export default async function Home() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  redirect(session.user.role === "STAFF" ? "/staff" : "/today");
}
