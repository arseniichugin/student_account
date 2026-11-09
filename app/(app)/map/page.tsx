import type { Metadata } from "next";
import { MapPinOff } from "lucide-react";
import { BackToScheduleButton } from "@/components/campus-map/back-button";
import { CampusMapView } from "@/components/campus-map/campus-map-view";
import { RetryButton } from "@/components/campus-map/retry-button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { loadCampusMap } from "@/lib/campus-map/load";

export const metadata: Metadata = { title: "Карта" };

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  // Карта — для любого вошедшего: студенту и сотруднику деканата.
  await requireUser();
  const { room: roomParam } = await searchParams;
  const room = (Array.isArray(roomParam) ? roomParam[0] : roomParam)?.trim().slice(0, 100) || null;
  // Файл карты заменяемый: читаем при каждом запросе и проверяем структуру.
  const map = await loadCampusMap();

  return (
    <div className="min-w-0 space-y-4">
      <div>
        {room && <BackToScheduleButton />}
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Карта</h1>
        <p className="mt-1 text-muted">Корпуса, этажи и аудитории. Найдите номер из расписания или выберите корпус.</p>
      </div>

      {map.ok ? (
        map.data.rooms.length === 0 ? (
          <Card className="flex flex-col items-center py-12 text-center">
            <MapPinOff className="size-10 text-muted" aria-hidden />
            <p className="mt-3 text-[17px] font-semibold">На карте пока нет помещений</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Деканат ещё не загрузил план корпусов. Загляните позже или обновите страницу.
            </p>
            <RetryButton className="mt-5" />
          </Card>
        ) : (
          <CampusMapView data={map.data} room={room} />
        )
      ) : (
        <Card role="alert" className="flex flex-col items-center py-12 text-center">
          <MapPinOff className="size-10 text-danger" aria-hidden />
          <p className="mt-3 text-[17px] font-semibold">Не удалось загрузить карту: {map.error}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Попробуйте ещё раз. Если ошибка повторяется — сообщите в деканат.
          </p>
          <RetryButton className="mt-5" />
        </Card>
      )}
    </div>
  );
}
