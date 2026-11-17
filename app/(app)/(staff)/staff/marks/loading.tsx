import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function StaffMarksLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем ввод оценок">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6">
        <Card className="space-y-4">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-11 w-44" />
        </Card>
        <Card className="space-y-3">
          <Skeleton className="h-5 w-52 max-w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
