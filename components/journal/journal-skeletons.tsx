import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";
import { cardGridClass } from "./assignment-card";

/** Скелетон карточки группы — той же формы, что AssignmentCard. */
function AssignmentCardSkeleton() {
  return (
    <Card className="space-y-3">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-4 w-48 max-w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-40" />
      <div className="space-y-3 border-t border-border pt-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-12" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function JournalListSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем группы">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Журнал</h1>
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <Card className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </Card>
      <Skeleton className="h-11 w-full max-w-md rounded-xl" />
      <div className="flex gap-2 overflow-hidden">
        {["w-28", "w-20", "w-20", "w-20", "w-40"].map((w, i) => (
          <Skeleton key={i} className={`h-11 shrink-0 rounded-full ${w}`} />
        ))}
      </div>
      <Skeleton className="h-7 w-48" />
      <div className={cardGridClass}>
        {Array.from({ length: 6 }, (_, i) => (
          <AssignmentCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Скелетон журнала группы: шапка, прогресс; телефон — карточки студентов, компьютер — таблица. */
export function JournalGroupSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем журнал группы">
      <Skeleton className="h-6 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </Card>
      {/* Телефон и планшет: выбор колонки + карточки */}
      <div className="space-y-3 lg:hidden">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="space-y-3">
              <Skeleton className="h-5 w-52 max-w-full" />
              <Skeleton className="h-3.5 w-28" />
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 4 }, (_, j) => (
                  <Skeleton key={j} className="h-11 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-12 w-40 rounded-xl" />
            </Card>
          ))}
        </div>
      </div>
      {/* Компьютер: таблица */}
      <Card className="hidden space-y-0 p-0 sm:p-0 lg:block">
        <div className="flex gap-4 border-b border-border px-4 py-3">
          {["w-48", "w-24", "w-24", "w-24", "w-20", "w-24"].map((w, i) => (
            <Skeleton key={i} className={`h-4 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
            <div className="w-48 space-y-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-20" />
            </div>
            {Array.from({ length: 3 }, (_, j) => (
              <Skeleton key={j} className="h-11 w-24 rounded-lg" />
            ))}
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-11 w-24 rounded-lg" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export function TeacherProfileSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Загружаем профиль">
      <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Профиль</h1>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <Card className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-4 w-48 max-w-full" />
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
