import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Компонент в стиле shadcn/ui (MIT), адаптирован под токены проекта.
export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "bg-surface-muted text-text hover:bg-border",
        ghost: "text-text hover:bg-surface-muted",
        danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
      },
      size: {
        md: "",
        sm: "min-h-9 rounded-lg px-3 text-sm",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
