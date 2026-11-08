import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FilePlus2, FileText } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { listMyRequests } from "@/lib/data/requests";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Заявки и справки" };

export default async function RequestsPage() {
  const ctx = await requireStudent();
  const requests = await listMyRequests(ctx);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold">Заявки</h1>
        <Link href="/requests/new" className={buttonVariants()}>
          <FilePlus2 className="size-4" aria-hidden />
          Новая
        </Link>
      </div>

      {requests.length === 0 ? (
        <Card className="flex flex-col items-center py-10 text-center">
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
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-muted sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{r.type.name}</p>
                    <p className="text-xs text-muted">от {formatDate(r.createdAt)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
