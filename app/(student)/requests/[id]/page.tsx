import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { StatusTimeline } from "@/components/status-timeline";
import { Card, CardTitle } from "@/components/ui/card";
import { DetailsList } from "@/components/ui/details-list";
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
  const details: [string, string][] = [
    ["Подана", formatDateTime(request.createdAt)],
    ["Обновлена", formatDateTime(request.updatedAt)],
  ];
  if (payload.destination) details.push(["Куда", payload.destination]);
  if (payload.copies) details.push(["Экземпляров", String(payload.copies)]);
  if (payload.comment) details.push(["Ваш комментарий", payload.comment]);
  details.push(["Срок готовности", `обычно ${request.type.etaDays} раб. дн.`]);

  return (
    <div className="space-y-4 lg:space-y-5">
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
        <h1 className="text-[24px] leading-tight font-bold lg:text-[32px]">{request.type.name}</h1>
        <StatusBadge status={request.status} className="text-sm" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div className="space-y-4">
          {request.staffComment && (
            <Card
              className={
                request.status === "REJECTED" ? "border-danger/30 bg-danger-soft" : "border-primary/20 bg-primary-soft"
              }
            >
              <p className="text-sm font-medium">Комментарий деканата</p>
              <p className="mt-1 text-[15px]">{request.staffComment}</p>
            </Card>
          )}
          <Card>
            <CardTitle className="mb-1 text-[15px]">Детали заявки</CardTitle>
            <DetailsList items={details} />
          </Card>
        </div>

        <Card className="self-start">
          <CardTitle className="mb-4 text-[15px]">Где сейчас заявка</CardTitle>
          <StatusTimeline status={request.status} />
        </Card>
      </div>
    </div>
  );
}
