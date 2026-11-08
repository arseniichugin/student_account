import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { getMyRequest } from "@/lib/data/requests";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Заявка" };

type Payload = { destination?: string; copies?: number; comment?: string };

export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const ctx = await requireStudent();
  const { id } = await params;
  const { created } = await searchParams;

  // Ищем заявку только среди СВОИХ. Чужой id → «Не найдено», даже если такая заявка есть.
  const request = await getMyRequest(ctx, id);
  if (!request) notFound();

  const payload = (request.payload ?? {}) as Payload;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/requests" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> К заявкам
      </Link>

      {created && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Заявка отправлена в деканат. Мы сообщим, когда статус изменится.
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[24px] leading-tight font-bold">{request.type.name}</h1>
        <StatusBadge status={request.status} className="text-sm" />
      </div>

      {request.staffComment && (
        <Card className={request.status === "REJECTED" ? "border-danger/30 bg-danger-soft" : "bg-primary-soft border-primary/20"}>
          <p className="text-sm font-medium">Комментарий деканата</p>
          <p className="mt-1 text-[15px]">{request.staffComment}</p>
        </Card>
      )}

      <Card>
        <dl className="divide-y divide-border">
          <Row label="Подана" value={formatDateTime(request.createdAt)} />
          <Row label="Обновлена" value={formatDateTime(request.updatedAt)} />
          {payload.destination && <Row label="Куда" value={payload.destination} />}
          {payload.copies && <Row label="Экземпляров" value={String(payload.copies)} />}
          {payload.comment && <Row label="Ваш комментарий" value={payload.comment} />}
          <Row label="Срок готовности" value={`обычно ${request.type.etaDays} раб. дн.`} />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-[15px] sm:text-right">{value}</dd>
    </div>
  );
}
