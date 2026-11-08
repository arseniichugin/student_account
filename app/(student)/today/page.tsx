import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronRight, FilePlus2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { getMyStudentProfile } from "@/lib/data/profile";
import { listMyRequests } from "@/lib/data/requests";

export const metadata: Metadata = { title: "Сегодня" };

const todayFmt = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

// Временная главная. Полноценный экран «Мой день» (следующая пара, переносы,
// дедлайны) — на этапе 3.
export default async function TodayPage() {
  const ctx = await requireStudent();
  const [profile, requests] = await Promise.all([getMyStudentProfile(ctx), listMyRequests(ctx)]);
  const active = requests.filter((r) => r.status !== "ISSUED" && r.status !== "REJECTED");
  const ready = active.filter((r) => r.status === "READY").length;

  return (
    <div className="space-y-5 lg:space-y-6">
      <div>
        <p className="text-sm text-muted first-letter:uppercase">{todayFmt.format(new Date())}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-bold lg:text-[32px]">Привет, {profile.firstName}!</h1>
        <p className="mt-1 text-muted">
          {profile.group.program.faculty.short} · {profile.group.course} курс · группа {profile.group.name}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <CardTitle>Мои заявки</CardTitle>
            <Link href="/requests" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
              Все заявки
            </Link>
          </div>
          {active.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted">Активных заявок нет.</p>
              <Link href="/requests/new" className={buttonVariants({ variant: "secondary", className: "mt-3" })}>
                Заказать справку
              </Link>
            </div>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {active.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-muted">
                    <span className="flex-1 text-[15px]">{r.type.name}</span>
                    <StatusBadge status={r.status} />
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
          <Card className="bg-primary-soft border-primary/20">
            <p className="text-sm text-muted">Готово к выдаче</p>
            <p className="mt-1 text-[32px] leading-none font-bold text-primary">{ready}</p>
            <p className="mt-2 text-sm text-muted">
              {ready > 0 ? "Заберите в деканате — подробности в заявке." : "Сообщим, как только справка будет готова."}
            </p>
          </Card>
          <Link href="/requests/new" className="block">
            <Card className="flex h-full items-center gap-3 hover:bg-surface-muted">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <FilePlus2 className="size-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-medium">Заказать справку</span>
                <span className="block text-sm text-muted">Без очереди в деканат</span>
              </span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Card>
          </Link>
        </div>

        <Card className="flex items-center gap-3 border-dashed bg-transparent lg:col-span-3">
          <CalendarClock className="size-5 shrink-0 text-muted" aria-hidden />
          <p className="text-sm text-muted">
            Скоро здесь появятся следующая пара, переносы занятий и ближайшие дедлайны.
          </p>
        </Card>
      </div>
    </div>
  );
}
