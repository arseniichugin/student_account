"use client";

import { useTransition } from "react";
import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** «Повторить»: по умолчанию заново запрашивает страницу с сервера (router.refresh). */
export function RetryButton({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className={className}
      disabled={pending}
      onClick={() => (onRetry ? onRetry() : startTransition(() => router.refresh()))}
    >
      <RotateCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
      Повторить
    </Button>
  );
}
