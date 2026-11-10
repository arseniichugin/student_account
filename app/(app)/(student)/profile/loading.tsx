import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function ProfileLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем профиль">
      <Skeleton className="h-8 w-36" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <Card className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </Card>
        <Card className="space-y-3 self-start">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      </div>
    </div>
  );
}
