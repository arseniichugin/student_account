import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bell, CalendarDays, FileCheck2, GraduationCap } from "lucide-react";
import { ConceptBadge } from "@/components/concept-badge";
import { Logo } from "@/components/logo";
import { getCurrentSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

const FEATURES = [
  { Icon: CalendarDays, title: "Расписание с переносами", text: "Следующая пара и все изменения — сразу на главном экране" },
  { Icon: GraduationCap, title: "Понятная успеваемость", text: "Оценки, долги и сессия — без поиска по разным системам" },
  { Icon: FileCheck2, title: "Справки онлайн", text: "Заказ в пару касаний и статус заявки без очереди в деканат" },
  { Icon: Bell, title: "Важное не потеряется", text: "Объявления деканата и напоминания о дедлайнах" },
];

const DISCLAIMER =
  "Учебный прототип для конкурса, а не официальный сервис какого-либо вуза. Все данные — вымышленные.";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Левая половина — о сервисе (только на компьютере) */}
      <section className="relative hidden overflow-hidden bg-primary p-12 text-on-primary lg:flex lg:flex-col">
        <HorizonArt />
        <div className="relative flex items-center gap-2">
          <Logo withText={false} inverse />
          <span className="text-lg font-semibold">Хогвартс · цифровой деканат</span>
        </div>
        <div className="relative my-auto max-w-md py-12">
          <p className="text-4xl leading-tight font-bold">Вся учёба — в одном месте</p>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-[15px]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative max-w-md text-[13px] leading-relaxed">{DISCLAIMER}</p>
      </section>

      {/* Правая половина — форма */}
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8 lg:max-w-none lg:items-center lg:justify-center lg:px-12">
        <div className="flex items-center justify-between lg:absolute lg:top-8 lg:right-12">
          <Logo className="lg:hidden" />
          <ConceptBadge />
        </div>

        <div className="my-auto w-full py-10 lg:my-0 lg:max-w-sm">
          <h1 className="text-[28px] leading-tight font-bold text-text">Вход в личный кабинет</h1>
          <p className="mt-2 text-[15px] text-muted">
            Расписание, оценки, справки и новости деканата — в одном месте.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>

        <p className="text-center text-xs leading-relaxed text-muted lg:hidden">{DISCLAIMER}</p>
      </main>
    </div>
  );
}

/** Декоративная «линия горизонта» с восходящим солнцем — в духе логотипа. */
function HorizonArt() {
  return (
    <svg
      className="pointer-events-none absolute -right-40 -bottom-32 h-[420px] w-[620px] opacity-[0.08]"
      viewBox="0 0 620 420"
      aria-hidden
    >
      <circle cx="380" cy="420" r="240" fill="currentColor" />
      <circle cx="380" cy="420" r="300" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="380" cy="420" r="360" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
