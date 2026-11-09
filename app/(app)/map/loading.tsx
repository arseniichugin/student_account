import { MapSkeleton } from "@/components/campus-map/campus-map-view";

export default function MapLoading() {
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-[28px] leading-tight font-bold lg:text-[32px]">Карта</h1>
        <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-surface-muted" />
      </div>
      <MapSkeleton />
    </div>
  );
}
