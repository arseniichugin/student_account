import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function NotificationsLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем уведомления">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-28" />
      </div>
      <ul className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i}>
            <Card className="flex gap-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-5 w-64 max-w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
