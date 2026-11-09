import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/guards";
import { getMyStaffProfile } from "@/lib/data/profile";
import { countFacultyRequestsByStatus, listFacultyRequests } from "@/lib/data/requests";
import type { RequestStatus } from "@/lib/generated/prisma/enums";
import { cn, formatDateTime } from "@/lib/utils";
import { REQUEST_STATUSES } from "@/lib/validation/requests";
import { StatusForm } from "./status-form";

export const metadata: Metadata = { title: "Заявки студентов" };

const FILTERS: { value?: RequestStatus; label: string }[] = [
  { label: "Все" },
  { value: "SUBMITTED", label: "Новые" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "READY", label: "Готовы" },
  { value: "ISSUED", label: "Выданы" },
  { value: "REJECTED", label: "Отклонены" },
];

type Payload = { destination?: string; copies?: number; comment?: string };

export default async function StaffRequestsPage({ searchParams }: PageProps<"/staff">) {
  const ctx = await requireStaff();
  const { status: rawStatus } = await searchParams;
  const status = REQUEST_STATUSES.find((s) => s === rawStatus);

  const [profile, requests, { counts, total }] = await Promise.all([
    getMyStaffProfile(ctx),
    listFacultyRequests(ctx, status),
    countFacultyRequestsByStatus(ctx),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Заявки студентов</h1>
        <p className="mt-1 text-muted">{profile.faculty.name}</p>
      </div>

      <nav aria-label="Фильтр по статусу" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-2">
          {FILTERS.map((f) => {
            const active = f.value === status;
            const count = f.value ? (counts[f.value] ?? 0) : total;
            return (
              <li key={f.label}>
                <Link
                  href={f.value ? `/staff?status=${f.value}` : "/staff"}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap",
                    active ? "bg-primary text-on-primary" : "bg-surface-muted text-muted hover:text-text",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs",
                      active ? "bg-black/15" : "bg-border/70",
                    )}
                  >
                    {count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {requests.length === 0 ? (
        <Card className="flex flex-col items-center py-12 text-center">
          <Inbox className="size-10 text-muted" aria-hidden />
          <p className="mt-3 text-[17px] font-semibold">Заявок нет</p>
          <p className="mt-1 text-sm text-muted">В этой категории пока пусто.</p>
          {status && (
            <Link href="/staff" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary">
              Показать все заявки
            </Link>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            const payload = (r.payload ?? {}) as Payload;
            const s = r.student;
            return (
              <li key={r.id}>
                {/* Компьютер: сведения слева, обработка справа. Телефон: друг под другом. */}
                <Card className="@container">
                  <div className="@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] @3xl:items-start @3xl:gap-8">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="text-[15px] font-semibold">{r.type.name}</h2>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-0.5 text-sm">
                      {s.lastName} {s.firstName} {s.middleName} · <span className="text-muted">{s.academicGroup.name}</span>
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {formatDateTime(r.createdAt)}
                      {payload.destination && ` · ${payload.destination}`}
                      {payload.copies && ` · ${payload.copies} экз.`}
                    </p>
                    {payload.comment && <p className="mt-1 text-sm">«{payload.comment}»</p>}
                  </div>
                  <StatusForm requestId={r.id} status={r.status} comment={r.staffComment ?? ""} title={r.type.name} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
