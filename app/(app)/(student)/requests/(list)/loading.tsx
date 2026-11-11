import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function RequestsLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем заявки">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-11 w-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6">
        <Card className="space-y-4 self-start">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </Card>
        <Card className="space-y-3 self-start">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
