import { CheckCircle2, CircleDashed, Clock, PackageCheck, XCircle } from "lucide-react";
import type { RequestStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

// Статус передаётся цветом, иконкой И текстом — понятно и без различения цветов.
const CONFIG: Record<RequestStatus, { label: string; className: string; Icon: typeof Clock }> = {
  SUBMITTED: { label: "Подана", className: "bg-surface-muted text-muted", Icon: CircleDashed },
  IN_PROGRESS: { label: "В работе", className: "bg-primary-soft text-primary", Icon: Clock },
  READY: { label: "Готова", className: "bg-success-soft text-success", Icon: CheckCircle2 },
  ISSUED: { label: "Выдана", className: "bg-surface-muted text-text", Icon: PackageCheck },
  REJECTED: { label: "Отклонена", className: "bg-danger-soft text-danger", Icon: XCircle },
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const { label, className: color, Icon } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        color,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
