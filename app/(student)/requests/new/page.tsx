import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/guards";
import { listRequestTypes } from "@/lib/data/requests";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "Новая заявка" };

export default async function NewRequestPage() {
  await requireStudent();
  const types = await listRequestTypes();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/requests" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> К заявкам
      </Link>
      <h1 className="text-[28px] leading-tight font-bold">Новая заявка</h1>
      <Card>
        <NewRequestForm types={types} />
      </Card>
    </div>
  );
}
