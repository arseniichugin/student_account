import { LessonListSkeleton, PeriodNavSkeleton } from "@/components/schedule/schedule-skeleton";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function ScheduleLoading() {
  return (
    <div className="min-w-0 space-y-5" role="status" aria-label="Загружаем расписание">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Расписание</h1>
        <Skeleton className="mt-2 h-4 w-60" />
      </div>
      <Card className="space-y-3" aria-hidden>
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {["w-32", "w-28", "w-24", "w-28", "w-28"].map((w, i) => (
            <Skeleton key={i} className={`h-11 rounded-full ${w}`} />
          ))}
        </div>
      </Card>
      <Skeleton className="h-7 w-48" />
      <PeriodNavSkeleton />
      <LessonListSkeleton count={4} />
    </div>
  );
}
