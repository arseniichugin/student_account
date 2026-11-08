import { cn } from "@/lib/utils";

// Поля формы в стиле shadcn/ui (MIT), адаптированы под токены проекта.

const fieldBase =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-[16px] text-text placeholder:text-muted outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "min-h-11", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldBase, "min-h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2.5", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-text", className)} {...props} />;
}

export function FormMessage({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={type === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-3.5 py-2.5 text-sm",
        type === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
      )}
    >
      {children}
    </p>
  );
}
