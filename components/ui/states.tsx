import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Пустое состояние или ошибка: иконка + заголовок + пояснение + действие (никаких тупиков). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  tone = "muted",
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "muted" | "danger";
  className?: string;
}) {
  return (
    <Card
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex flex-col items-center px-4 py-10 text-center", className)}
    >
      <Icon className={cn("size-10", tone === "danger" ? "text-danger" : "text-muted")} aria-hidden />
      <p className="mt-3 text-[17px] font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </Card>
  );
}

/** Серый прямоугольник-заглушка для экранов загрузки. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-muted", className)} aria-hidden />;
}
