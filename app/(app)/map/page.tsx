import type { Metadata } from "next";
import { MapPinOff } from "lucide-react";
import { BackToScheduleButton } from "@/components/campus-map/back-button";
import { CampusMapView } from "@/components/campus-map/campus-map-view";
import { RetryButton } from "@/components/ui/retry-button";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/guards";
import { loadCampusMap } from "@/lib/campus-map/load";

export const metadata: Metadata = { title: "Карта" };

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  // Карта — для любого вошедшего: студенту и сотруднику деканата.
  const user = await requireUser();
  const { room: roomParam } = await searchParams;
  const room = (Array.isArray(roomParam) ? roomParam[0] : roomParam)?.trim().slice(0, 100) || null;
  // Файл карты заменяемый: читаем при каждом запросе и проверяем структуру.
  const map = await loadCampusMap();
  // Подробности (файл, место ошибки в JSON) — в серверный лог; на странице — только сотруднику деканата,
  // который может заменить файл. Студенту технические детали ни к чему.
  if (!map.ok) console.error("[map] Карта кампуса не загрузилась:", map.error);

  return (
    <div className="min-w-0 space-y-4">
      <div>
        {room && <BackToScheduleButton />}
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Карта</h1>
        <p className="mt-1 text-muted">Корпуса, этажи и аудитории. Найдите номер из расписания или выберите корпус.</p>
      </div>

      {map.ok ? (
        map.data.rooms.length === 0 ? (
          <EmptyState icon={MapPinOff} title="На карте пока нет помещений" action={<RetryButton />}>
            Деканат ещё не загрузил план корпусов. Загляните позже или обновите страницу.
          </EmptyState>
        ) : (
          <CampusMapView data={map.data} room={room} />
        )
      ) : (
        <EmptyState
          icon={MapPinOff}
          tone="danger"
          title="Не удалось загрузить карту. Попробуйте позже"
          action={<RetryButton />}
        >
          <p>
            {user.role === "STAFF"
              ? "Проверьте файл карты в данных вуза — подробности ниже."
              : "Если ошибка повторяется — сообщите в деканат."}
          </p>
          {user.role === "STAFF" && (
            <p className="mt-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-left break-words text-text">
              Для сотрудника деканата: {map.error}
            </p>
          )}
        </EmptyState>
      )}
    </div>
  );
}
