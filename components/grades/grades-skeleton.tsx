import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

/** Скелетон экрана «Оценки» той же формы: заголовок, сводка + динамика | столбики, карточки дисциплин. */
export function GradesSkeleton() {
  return (
    <div className="space-y-5 lg:space-y-6" role="status" aria-label="Загружаем оценки">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-[52px] w-full rounded-xl lg:w-56" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-6" aria-hidden>
        <div className="grid grid-cols-1 content-start gap-4 lg:gap-6">
          <Card className="space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="size-16 rounded-2xl lg:size-20" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-9 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="space-y-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-[200px] w-full" />
          </Card>
        </div>
        <Card className="space-y-4 lg:self-start">
          <Skeleton className="h-5 w-56 max-w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 w-12" />
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
            </div>
          ))}
        </Card>
      </div>

      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-7 w-40" />
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="space-y-3 rounded-card border border-border bg-surface p-4 sm:p-5">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-8 w-16 rounded-xl" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-[74px] rounded-xl" />
                <Skeleton className="h-[74px] rounded-xl" />
                <Skeleton className="h-[74px] rounded-xl" />
              </div>
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
