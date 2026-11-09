import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { roomMapHref } from "@/lib/campus-map/links";
import { loadCampusMap } from "@/lib/campus-map/load";
import { findRoom } from "@/lib/campus-map/rooms";
import { campusMapSchema } from "@/lib/campus-map/schema";

// Карта кампуса: заменяемый файл data/university/campus-map.json — недоверенные данные.

const root = path.resolve(__dirname, "..");
const realFile = path.join(root, "data/university/campus-map.json");

const building = {
  id: "main",
  name: "Главный корпус",
  abbr: "ГК",
  address: "Замковая ул., 1",
  floors: [1, 2],
  wings: [0, 1],
  scheme: "ЭКNN",
};
const room = {
  id: 1,
  number: "1001",
  building: "main",
  type: "Лекционная",
  capacity: 100,
  floor: 1,
  wing: 0,
  purpose: null,
  bookable: true,
};
const valid = () => structuredClone({ buildings: [building], rooms: [room] });

describe("схема campus-map.json", () => {
  it("принимает текущий файл data/university/campus-map.json", async () => {
    const json = JSON.parse(await readFile(realFile, "utf8"));
    const parsed = campusMapSchema.safeParse(json);
    expect(parsed.success, parsed.error?.message).toBe(true);
    expect(parsed.data!.rooms.length).toBeGreaterThan(200);
  });

  it("допускает лишние поля", () => {
    const d = { ...valid(), version: 2 };
    d.rooms[0] = { ...d.rooms[0], color: "red" } as typeof room;
    expect(campusMapSchema.safeParse(d).success).toBe(true);
  });

  const broken: [string, (d: ReturnType<typeof valid>) => unknown][] = [
    ["не объект", () => "карта"],
    ["нет rooms", (d) => ({ buildings: d.buildings })],
    ["нет корпусов", (d) => ({ ...d, buildings: [] })],
    ["номер не строка", (d) => ({ ...d, rooms: [{ ...room, number: 1001 }] })],
    ["пустой номер", (d) => ({ ...d, rooms: [{ ...room, number: "  " }] })],
    ["нет типа", (d) => ({ ...d, rooms: [{ ...room, type: undefined }] })],
    ["этаж не число", (d) => ({ ...d, rooms: [{ ...room, floor: "1" }] })],
    ["неизвестный корпус", (d) => ({ ...d, rooms: [{ ...room, building: "__proto__" }] })],
    ["этажа нет в корпусе", (d) => ({ ...d, rooms: [{ ...room, floor: 9 }] })],
    ["повтор номера", (d) => ({ ...d, rooms: [room, { ...room, id: 2 }] })],
    ["повтор корпуса", (d) => ({ ...d, buildings: [building, building] })],
    ["у корпуса нет этажей", (d) => ({ ...d, buildings: [{ ...building, floors: [] }] })],
    ["purpose не строка", (d) => ({ ...d, rooms: [{ ...room, purpose: { html: "<b>" } }] })],
  ];
  it.each(broken)("отклоняет битые данные: %s", (_, make) => {
    expect(campusMapSchema.safeParse(make(valid())).success).toBe(false);
  });
});

describe("loadCampusMap: файл из UNIVERSITY_DATA_DIR", () => {
  let dir: string;
  const saved = process.env.UNIVERSITY_DATA_DIR;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "campus-map-"));
    process.env.UNIVERSITY_DATA_DIR = dir;
  });
  afterEach(async () => {
    await rm(path.join(dir, "campus-map.json"), { force: true });
  });
  afterAll(async () => {
    if (saved === undefined) delete process.env.UNIVERSITY_DATA_DIR;
    else process.env.UNIVERSITY_DATA_DIR = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it("нет файла — понятная ошибка, а не исключение", async () => {
    expect(await loadCampusMap()).toEqual({ ok: false, error: "файл campus-map.json не найден" });
  });

  it("не JSON — понятная ошибка", async () => {
    await writeFile(path.join(dir, "campus-map.json"), "{ битый");
    const r = await loadCampusMap();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/повреждён/);
  });

  it("неверная структура — ошибка с указанием места", async () => {
    await writeFile(path.join(dir, "campus-map.json"), JSON.stringify({ buildings: [building], rooms: [{ ...room, number: 5 }] }));
    const r = await loadCampusMap();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/rooms\[0\]\.number/);
  });

  it("правильный файл читается без пересборки, текст с HTML остаётся просто текстом", async () => {
    const d = valid();
    d.rooms[0] = { ...room, purpose: '<img src=x onerror="alert(1)">' } as unknown as typeof room;
    await writeFile(path.join(dir, "campus-map.json"), JSON.stringify(d));
    const r = await loadCampusMap();
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.rooms[0].purpose).toBe('<img src=x onerror="alert(1)">');
  });
});

describe("ссылки и поиск аудитории", () => {
  it("roomMapHref кодирует номер", () => {
    expect(roomMapHref("3041")).toBe("/map?room=3041");
    expect(roomMapHref("Обсерватория-1")).toBe(`/map?room=${encodeURIComponent("Обсерватория-1")}`);
    expect(new URL(roomMapHref("Манеж-2 & co"), "http://x").searchParams.get("room")).toBe("Манеж-2 & co");
  });

  it("findRoom: номер без учёта регистра, затем часть названия", () => {
    const d = { rooms: [room, { ...room, number: "Обсерватория-1" }, { ...room, number: "2031", purpose: "Ректорат" }] };
    expect(findRoom(d, "1001")?.number).toBe("1001");
    expect(findRoom(d, "обсерватория-1")?.number).toBe("Обсерватория-1");
    expect(findRoom(d, "ректорат")?.number).toBe("2031");
    expect(findRoom(d, "9999")).toBeNull();
    expect(findRoom(d, "  ")).toBeNull();
  });
});

describe("public/campus-map/campus-map.js", () => {
  it("не вставляет данные как HTML (только textContent / setAttribute)", async () => {
    const code = await readFile(path.join(root, "public/campus-map/campus-map.js"), "utf8");
    expect(code).not.toMatch(/\.(innerHTML|outerHTML)\s*[+]?=/);
    expect(code).not.toMatch(/(insertAdjacentHTML|document\.write|createContextualFragment)\s*\(/);
  });
});
