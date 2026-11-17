import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function GradesLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем оценки">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-60 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="space-y-3">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-4 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card className="space-y-3">
          <Skeleton className="h-5 w-44" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </Card>
        <Card className="space-y-3">
          <Skeleton className="h-5 w-52 max-w-full" />
          <Skeleton className="h-44 w-full" />
        </Card>
      </div>
    </div>
  );
}
