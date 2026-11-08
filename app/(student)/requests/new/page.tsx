import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { listRequestTypes } from "@/lib/data/requests";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "Новая заявка" };

export default async function NewRequestPage() {
  await requireStudent();
  const types = await listRequestTypes();

  return (
    <div className="space-y-4 lg:space-y-5">
      <Link href="/requests" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> К заявкам
      </Link>
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Новая заявка</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6">
        <Card>
          <NewRequestForm types={types} />
        </Card>

        <Card className="self-start">
          <CardTitle className="text-[15px]">Как это работает</CardTitle>
          <ol className="mt-3 space-y-3 text-sm text-muted">
            <li>1. Выберите документ и укажите, куда он нужен.</li>
            <li>2. Деканат возьмёт заявку в работу — статус обновится, придёт уведомление.</li>
            <li>3. Когда справка будет готова, в заявке появится, где и когда её забрать.</li>
          </ol>
          <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-muted">
            <p className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" aria-hidden /> Выдача: корпус Г, ауд. Г-112
            </p>
            <p className="flex items-center gap-2">
              <Clock className="size-4 shrink-0" aria-hidden /> Пн–пт, 10:00–16:00
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
