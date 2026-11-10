"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import { RetryButton } from "@/components/campus-map/retry-button";
import { Card } from "@/components/ui/card";
import { findRoom } from "@/lib/campus-map/rooms";
import type { CampusMapData, CampusRoom } from "@/lib/campus-map/schema";

/* Готовый компонент карты без зависимостей лежит в public/campus-map/ (см. tools/campus-map/README.md).
   Подключаем его скрипт и стили один раз на всё приложение и монтируем в контейнер. */

const SCRIPT_SRC = "/campus-map/campus-map.js";
const STYLE_HREF = "/campus-map/campus-map.css";

type HogwartsMapInstance = {
  focus: (query: string) => CampusRoom | null;
  show: (buildingId?: string | null, floor?: number) => void;
  destroy: () => void;
};

type HogwartsMapApi = {
  mount: (
    el: HTMLElement,
    opts: {
      data: CampusMapData;
      hash?: boolean;
      onSelect?: (room: CampusRoom) => void;
      onClear?: () => void;
      headingLevel?: number;
      insets?: () => { top: number; bottom: number };
    },
  ) => HogwartsMapInstance;
};

declare global {
  interface Window {
    HogwartsMap?: HogwartsMapApi;
  }
}

let assetsPromise: Promise<HogwartsMapApi> | null = null;

function loadAsset<T extends HTMLLinkElement | HTMLScriptElement>(selector: string, create: () => T): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<T>(selector);
    if (existing?.dataset.loaded === "1") return resolve();
    const node = existing ?? create();
    node.addEventListener("load", () => {
      node.dataset.loaded = "1";
      resolve();
    });
    node.addEventListener("error", () => {
      node.remove();
      reject(new Error("asset"));
    });
    if (!existing) document.head.appendChild(node);
  });
}

/** Скрипт и стили карты — один раз; при ошибке сети следующая попытка загрузит заново. */
function loadCampusMapAssets(): Promise<HogwartsMapApi> {
  if (window.HogwartsMap) return Promise.resolve(window.HogwartsMap);
  assetsPromise ??= Promise.all([
    loadAsset("link[data-campus-map]", () => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = STYLE_HREF;
      link.dataset.campusMap = "";
      return link;
    }),
    loadAsset("script[data-campus-map]", () => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.dataset.campusMap = "";
      return script;
    }),
  ])
    .then(() => {
      if (!window.HogwartsMap) throw new Error("no HogwartsMap");
      return window.HogwartsMap;
    })
    .catch((e) => {
      assetsPromise = null;
      throw e;
    });
  return assetsPromise;
}

/** Меняет ?room=… в адресе без перезагрузки и без новой записи в истории:
    «Назад» ведёт туда, откуда пришли (в расписание), а не по каждому клику на карте. */
function replaceRoomInUrl(room: string | null) {
  const url = new URL(window.location.href);
  if (room) url.searchParams.set("room", room);
  else url.searchParams.delete("room");
  url.hash = "";
  window.history.replaceState(null, "", url.pathname + url.search);
}

// Цвета карты — из токенов кабинета (app/globals.css), чтобы карта следовала теме.
const THEME_VARS = {
  "--hm-bg": "var(--surface-muted)",
  "--hm-surface": "var(--surface)",
  "--hm-text": "var(--text)",
  "--hm-muted": "var(--text-muted)",
  "--hm-line": "var(--border)",
  "--hm-accent": "var(--primary)",
  "--hm-accent-2": "color-mix(in srgb, var(--primary) 75%, var(--surface))",
  "--hm-accent-3": "var(--primary-hover)",
  // текст на акцентном фоне: в тёмной теме акцент светлый, белый на нём — 2.9:1, var(--on-primary) — 6.6:1
  "--hm-on-accent": "var(--on-primary)",
  fontFamily: "inherit",
} as React.CSSProperties;

/** Сколько окна закрывают липкая шапка и нижнее меню кабинета (на компьютере их нет). */
function shellInsets(): { top: number; bottom: number } {
  const top = document.querySelector("[data-shell-overlay=top]")?.getBoundingClientRect();
  const bottom = document.querySelector("[data-shell-overlay=bottom]")?.getBoundingClientRect();
  return {
    top: top && top.height > 0 ? Math.max(0, top.bottom) : 0,
    bottom: bottom && bottom.height > 0 ? Math.max(0, window.innerHeight - bottom.top) : 0,
  };
}

export type CampusMapViewProps = {
  /** Проверенные данные карты (lib/campus-map/load.ts). */
  data: CampusMapData;
  /** Номер аудитории из адреса /map?room=… — открыть и подсветить. */
  room?: string | null;
};

export function CampusMapView({ data, room = null }: CampusMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HogwartsMapInstance | null>(null);
  const selectedRef = useRef<string | null>(null);
  const roomRef = useRef(room);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  // Номер монтирования карты: после каждого (первого, повторного, с новыми данными) открываем аудиторию из адреса.
  const [mounted, setMounted] = useState(0);

  // Сообщение «не найдена» прячем, когда пользователь сам выбрал помещение на карте.
  const [noticeFor, setNoticeFor] = useState<string | null>(room);
  const [prevRoom, setPrevRoom] = useState(room);
  if (room !== prevRoom) {
    setPrevRoom(room);
    setNoticeFor(room);
  }
  const missingRoom = noticeFor && !findRoom(data, noticeFor) ? noticeFor : null;

  // Открыть аудиторию из адреса: нужный корпус и этаж, подсветка и карточка.
  const focusRoom = (query: string | null) => {
    const r = query ? findRoom(data, query) : null;
    if (r && mapRef.current && selectedRef.current !== r.number) mapRef.current.focus(r.number);
  };

  // Загрузка скрипта и стилей, затем монтирование карты в контейнер.
  // В StrictMode React вызывает эффект дважды (mount → cleanup → mount): cleanup отменяет
  // первую попытку и полностью очищает контейнер, поэтому вторая карта не появляется рядом с первой.
  useEffect(() => {
    let cancelled = false;
    let instance: HogwartsMapInstance | null = null;
    loadCampusMapAssets()
      .then((api) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        try {
          // campus-map.js дописывает поля в объекты помещений — отдаём копию, а не props.
          instance = api.mount(el, {
            data: structuredClone(data),
            hash: false,
            // над картой — h1 «Карта», значит план — h2, карточка помещения — h3
            headingLevel: 2,
            insets: shellInsets,
            onSelect: (r) => {
              selectedRef.current = r.number;
              setNoticeFor(null);
              replaceRoomInUrl(r.number);
            },
            onClear: () => {
              selectedRef.current = null;
              replaceRoomInUrl(null);
            },
          });
        } catch (e) {
          // Без перехвата ошибка уронила бы всю страницу кабинета — показываем её только вместо карты.
          el.replaceChildren();
          throw e;
        }
        mapRef.current = instance;
        setStatus("ready");
        setMounted((n) => n + 1);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Карта кампуса не загрузилась", e);
        setStatus("error");
      });
    return () => {
      cancelled = true;
      instance?.destroy();
      mapRef.current = null;
      selectedRef.current = null;
    };
  }, [attempt, data]);

  // Аудиторию из адреса открываем после того, как скелетон убран: иначе прокрутка к ней
  // рассчитается по старой раскладке и аудитория уедет из окна.
  useEffect(() => {
    if (mounted > 0) focusRoom(roomRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // 3. Адрес поменялся без перемонтирования (переход по ссылке /map?room=… с этой же страницы).
  useEffect(() => {
    roomRef.current = room;
    focusRoom(room);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  if (status === "error") {
    return (
      <Card role="alert" className="flex flex-col items-center py-10 text-center">
        <MapPinOff className="size-10 text-muted" aria-hidden />
        <p className="mt-3 text-[17px] font-semibold">Не удалось загрузить карту</p>
        <p className="mt-1 max-w-sm text-sm text-muted">Проверьте интернет и попробуйте ещё раз.</p>
        <RetryButton
          className="mt-5"
          onRetry={() => {
            setStatus("loading");
            setAttempt((n) => n + 1);
          }}
        />
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {missingRoom && (
        <p
          role="status"
          className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[15px] break-words text-text"
        >
          Аудитория {missingRoom} не найдена на карте. Проверьте номер или найдите помещение через поиск.
        </p>
      )}
      {status === "loading" && <MapSkeleton />}
      <div ref={containerRef} style={THEME_VARS} className="min-w-0" />
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div aria-busy="true" aria-label="Карта загружается" className="animate-pulse space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="h-11 min-w-0 flex-[1_1_240px] rounded-xl bg-surface-muted" />
        <div className="h-11 w-40 rounded-xl bg-surface-muted" />
      </div>
      <div className="aspect-[4/3] max-h-[420px] w-full rounded-card bg-surface-muted" />
      <div className="h-12 w-full rounded-card bg-surface-muted" />
    </div>
  );
}
