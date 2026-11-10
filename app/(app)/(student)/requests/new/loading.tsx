import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function NewRequestLoading() {
  return (
    <div className="space-y-4 lg:space-y-5" role="status" aria-label="Загружаем форму заявки">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6">
        <Card className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-40 rounded-xl" />
        </Card>
        <Card className="space-y-3 self-start">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
