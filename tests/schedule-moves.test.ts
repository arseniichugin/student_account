import { describe, expect, it } from "vitest";
import { formatDayMonth, movedSearchRange, parseMovedFrom } from "@/lib/schedule/moves";

// Заглушка «Перенесено на …» на исходной дате строится из причины переноса у нового занятия.
// Разбор необязательный: чужой формат причины → null, а не ошибка.

describe("parseMovedFrom: причина переноса из генератора", () => {
  it("«Перенесено с 03.11 (1 пара)» → 3 ноября того же года, 1-я пара", () => {
    expect(parseMovedFrom("Перенесено с 03.11 (1 пара)", "2026-11-06")).toEqual({ date: "2026-11-03", pairStart: 1, pairEnd: 1 });
  });

  it("перенос на более раннюю дату", () => {
    expect(parseMovedFrom("Перенесено с 10.09 (3 пара)", "2026-09-07")).toEqual({ date: "2026-09-10", pairStart: 3, pairEnd: 3 });
  });

  it("через Новый год берётся ближайший год", () => {
    expect(parseMovedFrom("Перенесено с 29.12 (2 пара)", "2027-01-02")?.date).toBe("2026-12-29");
    expect(parseMovedFrom("Перенесено с 03.01 (2 пара)", "2026-12-30")?.date).toBe("2027-01-03");
  });

  it("год, диапазон пар и «-я» — тоже понимает", () => {
    expect(parseMovedFrom("Перенесено с 03.11.2026 (1–2 пары)", "2026-11-06")).toEqual({ date: "2026-11-03", pairStart: 1, pairEnd: 2 });
    expect(parseMovedFrom("Перенесено с 3.11 (4-я пара)", "2026-11-06")).toEqual({ date: "2026-11-03", pairStart: 4, pairEnd: 4 });
  });

  it.each([
    ["пусто", null],
    ["отмена", "Занятие отменено"],
    ["замена", "Замена преподавателя (было: Баранов В.М.)"],
    ["другой формат", "Перенос на 06.11"],
    ["нет такой даты", "Перенесено с 31.02 (1 пара)"],
    ["нулевая пара", "Перенесено с 03.11 (0 пара)"],
    ["слишком далеко", "Перенесено с 03.11.2025 (1 пара)"],
  ])("не подходит под шаблон → null: %s", (_, note) => {
    expect(parseMovedFrom(note, "2026-11-06")).toBeNull();
  });

  it("битая дата нового занятия → null", () => {
    expect(parseMovedFrom("Перенесено с 03.11 (1 пара)", "мусор")).toBeNull();
  });
});

describe("подписи и период поиска", () => {
  it("formatDayMonth", () => {
    expect(formatDayMonth("2026-11-06")).toBe("06.11");
  });

  it("movedSearchRange захватывает переносы в обе стороны", () => {
    const r = movedSearchRange("2026-11-02", "2026-11-08");
    expect(r.from < "2026-10-29").toBe(true);
    expect(r.to > "2026-11-15").toBe(true);
  });
});
