import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function StaffLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем заявки студентов">
      <div className="space-y-2">
        <Skeleton className="h-8 w-60 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="space-y-3">
            <div className="flex justify-between gap-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-4 w-40" />
          </Card>
        ))}
      </div>
    </div>
  );
}
