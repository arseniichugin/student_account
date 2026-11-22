import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function TeacherNotificationsLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем уведомления">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-6">
        <Card className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-32 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-40" />
        </Card>
        <Card className="space-y-3">
          <Skeleton className="h-5 w-44" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
