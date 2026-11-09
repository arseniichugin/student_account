import { LessonListSkeleton, PeriodNavSkeleton } from "@/components/schedule/schedule-skeleton";
import { Skeleton } from "@/components/ui/states";

export default function TodayLoading() {
  return (
    <div className="space-y-5 lg:space-y-6" role="status" aria-label="Загружаем расписание на день">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-48" />
      </div>
      <PeriodNavSkeleton />
      <LessonListSkeleton count={4} />
    </div>
  );
}
