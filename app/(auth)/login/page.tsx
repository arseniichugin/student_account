import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConceptBadge } from "@/components/concept-badge";
import { Logo } from "@/components/logo";
import { getCurrentSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <ConceptBadge />
      </div>

      <div className="my-auto py-10">
        <h1 className="text-[28px] leading-tight font-bold text-text">Вход в личный кабинет</h1>
        <p className="mt-2 text-[15px] text-muted">
          Расписание, оценки, справки и новости деканата — в одном месте.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>

      <p className="text-center text-xs leading-relaxed text-muted">
        Университет «Горизонт» вымышлен. Это учебный прототип для конкурса,
        а не официальный сервис какого-либо вуза. Все данные — вымышленные.
      </p>
    </main>
  );
}
