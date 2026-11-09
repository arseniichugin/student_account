import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

/** Скелетон списка занятий: так же устроен, как LessonCard (время слева, текст справа). */
export function LessonListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex gap-3 rounded-card border border-border bg-surface p-4">
          <div className="w-12 shrink-0 space-y-1.5">
            <Skeleton className="h-4 w-11" />
            <Skeleton className="h-3.5 w-9" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Скелетон панели «← дата →» с кнопками. */
export function PeriodNavSkeleton() {
  return (
    <Card className="space-y-3" aria-hidden>
      <div className="flex items-center gap-2">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="mx-auto h-5 w-40" />
        <Skeleton className="size-11 rounded-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-40 rounded-xl" />
        <Skeleton className="h-11 w-24 rounded-xl" />
      </div>
    </Card>
  );
}
