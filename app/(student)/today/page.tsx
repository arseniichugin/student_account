import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { getMyStudentProfile } from "@/lib/data/profile";
import { listMyRequests } from "@/lib/data/requests";

export const metadata: Metadata = { title: "Сегодня" };

// Временная главная. Полноценный экран «Мой день» (следующая пара, переносы,
// дедлайны) — на этапе 3.
export default async function TodayPage() {
  const ctx = await requireStudent();
  const [profile, requests] = await Promise.all([getMyStudentProfile(ctx), listMyRequests(ctx)]);
  const active = requests.filter((r) => r.status !== "ISSUED" && r.status !== "REJECTED");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[28px] leading-tight font-bold">Привет, {profile.firstName}!</h1>
        <p className="mt-1 text-muted">
          {profile.group.program.faculty.short} · {profile.group.course} курс · группа {profile.group.name}
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Мои заявки</CardTitle>
          <Link href="/requests" className="text-sm font-medium text-primary">
            Все
          </Link>
        </div>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Активных заявок нет.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {active.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex items-center gap-3 py-3">
                  <span className="flex-1 text-[15px]">{r.type.name}</span>
                  <StatusBadge status={r.status} />
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-dashed bg-transparent">
        <p className="text-sm text-muted">
          Скоро здесь появятся следующая пара, переносы занятий и ближайшие дедлайны.
        </p>
      </Card>
    </div>
  );
}
