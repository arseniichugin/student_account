import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FilePlus2, FileText } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { listMyRequests } from "@/lib/data/requests";
import type { RequestStatus } from "@/lib/generated/prisma/enums";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Заявки и справки" };

const STATUS_HELP: [RequestStatus, string][] = [
  ["SUBMITTED", "заявка в очереди деканата"],
  ["IN_PROGRESS", "специалист готовит документ"],
  ["READY", "можно забрать — где и когда, написано в заявке"],
  ["ISSUED", "документ у вас"],
  ["REJECTED", "причина — в комментарии деканата"],
];

export default async function RequestsPage() {
  const ctx = await requireStudent();
  const requests = await listMyRequests(ctx);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Заявки</h1>
        <Link href="/requests/new" className={buttonVariants()}>
          <FilePlus2 className="size-4" aria-hidden />
          <span>
            Новая<span className="hidden sm:inline"> заявка</span>
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        {requests.length === 0 ? (
          <Card className="flex flex-col items-center py-12 text-center">
            <FileText className="size-10 text-muted" aria-hidden />
            <p className="mt-3 text-[17px] font-semibold">Заявок пока нет</p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              Закажите справку онлайн — не нужно идти в деканат и стоять в очереди.
            </p>
            <Link href="/requests/new" className={buttonVariants({ className: "mt-5" })}>
              Заказать справку
            </Link>
          </Card>
        ) : (
          <Card className="self-start p-0 sm:p-0">
            {/* Заголовки колонок — только на широком экране */}
            <div className="hidden grid-cols-[minmax(0,1fr)_140px_120px_20px] gap-4 border-b border-border px-5 py-3 text-xs font-medium tracking-wide text-muted uppercase md:grid">
              <span>Документ</span>
              <span>Подана</span>
              <span>Статус</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/requests/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-muted sm:px-5 md:grid md:grid-cols-[minmax(0,1fr)_140px_120px_20px] md:gap-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{r.type.name}</span>
                      <span className="block text-xs text-muted md:hidden">от {formatDate(r.createdAt)}</span>
                    </span>
                    <span className="hidden text-sm text-muted md:block">{formatDate(r.createdAt)}</span>
                    <span>
                      <StatusBadge status={r.status} />
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="self-start">
          <CardTitle className="text-[15px]">Что означают статусы</CardTitle>
          <ul className="mt-3 space-y-2.5">
            {STATUS_HELP.map(([status, text]) => (
              <li key={status} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <StatusBadge status={status} />
                {text}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
