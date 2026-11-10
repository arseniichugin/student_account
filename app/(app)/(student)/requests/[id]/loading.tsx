import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function RequestLoading() {
  return (
    <div className="space-y-4 lg:space-y-5" role="status" aria-label="Загружаем заявку">
      <Skeleton className="h-5 w-24" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <Card className="space-y-3">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </Card>
        <Card className="order-first space-y-4 self-start xl:order-none">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
