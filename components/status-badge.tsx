import { CheckCircle2, CircleDashed, Clock, PackageCheck, XCircle } from "lucide-react";
import type { RequestStatus } from "@/lib/generated/prisma/enums";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/status";
import { cn } from "@/lib/utils";

// Статус передаётся цветом, иконкой И текстом — понятно и без различения цветов.
const CONFIG: Record<RequestStatus, { className: string; Icon: typeof Clock }> = {
  SUBMITTED: { className: "bg-surface-muted text-muted", Icon: CircleDashed },
  IN_PROGRESS: { className: "bg-primary-soft text-primary", Icon: Clock },
  READY: { className: "bg-success-soft text-success", Icon: CheckCircle2 },
  ISSUED: { className: "bg-surface-muted text-text", Icon: PackageCheck },
  REJECTED: { className: "bg-danger-soft text-danger", Icon: XCircle },
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const { className: color, Icon } = CONFIG[status];
  const label = REQUEST_STATUS_LABEL[status];
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
