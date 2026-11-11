import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

/** Скелетон обзора курса той же формы: заголовок, поиск, курсы, сводка | распределение, группы, списки. */
export function CourseOverviewSkeleton() {
  return (
    <div className="space-y-5 lg:space-y-6" role="status" aria-label="Загружаем успеваемость курса">
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Успеваемость</h1>
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" aria-hidden>
        <Skeleton className="h-[72px] w-full rounded-xl" />
        <Skeleton className="h-[52px] w-full rounded-xl lg:w-80" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6" aria-hidden>
        <Card className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-2xl lg:size-20" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3.5 w-48 max-w-full" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </Card>
        <Card className="space-y-4">
          <Skeleton className="h-5 w-56 max-w-full" />
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </Card>
      </div>
      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-7 w-44" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-card lg:h-14" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Скелетон страницы группы: «Назад», заголовок, сводка, таблица / список студентов. */
export function GroupGradesSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем оценки группы">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Card className="space-y-4" aria-hidden>
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
      </Card>
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Шапка студента для скелетона страницы студента (дальше — GradesSkeleton студента). */
export function StudentHeaderSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-56 max-w-full" />
    </div>
  );
}
