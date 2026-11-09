import { cn } from "@/lib/utils";

/**
 * Список «подпись — значение».
 * Узкий блок: подпись над значением. Широкий (по ширине самого блока, а не экрана): две колонки, значение рядом с подписью
 * (а не у противоположного края — так глазу не нужно «прыгать» через весь экран).
 */
export function DetailsList({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("@container divide-y divide-border", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-0.5 py-2.5 @md:grid-cols-[180px_minmax(0,1fr)] @md:gap-6">
          <dt className="text-sm text-muted @md:py-px">{label}</dt>
          <dd className="text-[15px] break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
