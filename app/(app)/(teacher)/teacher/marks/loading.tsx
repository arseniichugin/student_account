import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

export default function TeacherJournalLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем журнал">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-36 shrink-0 rounded-xl" />
        ))}
      </div>
      <Card className="space-y-2">
        <Skeleton className="h-5 w-52 max-w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-11 w-32 shrink-0" />
            {Array.from({ length: 6 }, (_, j) => (
              <Skeleton key={j} className="h-11 w-11 shrink-0" />
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
