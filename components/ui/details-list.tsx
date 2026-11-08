import { cn } from "@/lib/utils";

/**
 * Список «подпись — значение».
 * Телефон: подпись над значением. Компьютер: две колонки, значение рядом с подписью
 * (а не у противоположного края — так глазу не нужно «прыгать» через весь экран).
 */
export function DetailsList({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 py-2.5 sm:grid-cols-[minmax(0,200px)_1fr] sm:gap-6">
          <dt className="text-sm text-muted sm:py-px">{label}</dt>
          <dd className="text-[15px]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
