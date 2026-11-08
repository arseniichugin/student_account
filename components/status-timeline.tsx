import { Check, X } from "lucide-react";
import type { RequestStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const STEPS: { status: RequestStatus; label: string; hint: string }[] = [
  { status: "SUBMITTED", label: "Подана", hint: "Заявка в очереди деканата" },
  { status: "IN_PROGRESS", label: "В работе", hint: "Специалист готовит документ" },
  { status: "READY", label: "Готова", hint: "Можно забрать в деканате" },
  { status: "ISSUED", label: "Выдана", hint: "Документ у вас" },
];

/** Путь заявки: где она сейчас и что будет дальше. */
export function StatusTimeline({ status }: { status: RequestStatus }) {
  if (status === "REJECTED") {
    return (
      <ol className="space-y-0">
        <Step label="Подана" hint="Заявка поступила в деканат" state="done" />
        <Step label="Отклонена" hint="Причина — в комментарии деканата" state="rejected" last />
      </ol>
    );
  }

  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol>
      {STEPS.map((s, i) => (
        <Step
          key={s.status}
          label={s.label}
          hint={s.hint}
          state={i < current ? "done" : i === current ? "current" : "todo"}
          last={i === STEPS.length - 1}
        />
      ))}
    </ol>
  );
}

function Step({
  label,
  hint,
  state,
  last,
}: {
  label: string;
  hint: string;
  state: "done" | "current" | "todo" | "rejected";
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0" aria-current={state === "current" ? "step" : undefined}>
      {!last && (
        <span
          className={cn("absolute top-7 bottom-1 left-[13px] w-0.5", state === "done" ? "bg-primary" : "bg-border")}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "relative flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs",
          state === "done" && "border-primary bg-primary text-on-primary",
          state === "current" && "border-primary bg-primary-soft",
          state === "todo" && "border-border bg-surface",
          state === "rejected" && "border-danger bg-danger text-white",
        )}
        aria-hidden
      >
        {state === "done" && <Check className="size-4" />}
        {state === "current" && <span className="size-2.5 rounded-full bg-primary" />}
        {state === "rejected" && <X className="size-4" />}
      </span>
      <span className="pt-0.5">
        <span className={cn("block text-[15px] font-medium", state === "todo" && "text-muted")}>
          {label}
          {state === "current" && <span className="sr-only"> — текущий этап</span>}
        </span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </li>
  );
}
