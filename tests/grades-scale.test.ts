/**
 * Шкала оценок (lib/grades/scale.ts) и учебный период (lib/grades/term.ts). База не нужна.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GRADE_SCALE,
  averagePoints,
  formatPoints,
  formatScored,
  gradeFor,
  isValidPoints,
  letterFor,
  overallAverage,
  scoredAverage,
} from "@/lib/grades/scale";
import {
  CHECKPOINTS,
  academicYearLabel,
  currentCheckpoint,
  semesterForCourse,
  semesterLabel,
  semestersUpTo,
  termLabel,
} from "@/lib/grades/term";

describe("Шкала ECTS", () => {
  it("границы букв — как в спецификации", () => {
    const cases: [number, string, number][] = [
      [100, "A", 5],
      [90, "A", 5],
      [89, "B", 4],
      [82, "B", 4],
      [81, "C", 4],
      [74, "C", 4],
      [73, "D", 3],
      [64, "D", 3],
      [63, "E", 3],
      [60, "E", 3],
      [59, "FX", 2],
      [35, "FX", 2],
      [34, "F", 2],
      [0, "F", 2],
    ];
    for (const [points, letter, five] of cases) {
      expect(gradeFor(points).letter, `${points} баллов`).toBe(letter);
      expect(gradeFor(points).five).toBe(five);
    }
  });

  it("шкала без пропусков и пересечений покрывает 0–100", () => {
    const sorted = [...GRADE_SCALE].sort((a, b) => a.min - b.min);
    expect(sorted[0]!.min).toBe(0);
    expect(sorted.at(-1)!.max).toBe(100);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.min).toBe(sorted[i - 1]!.max + 1);
  });

  it("дробные средние — по нижней границе; вне 0–100 — ошибка", () => {
    expect(letterFor(89.9)).toBe("B");
    expect(letterFor(59.5)).toBe("FX");
    expect(() => gradeFor(101)).toThrow(RangeError);
    expect(() => gradeFor(-1)).toThrow(RangeError);
    expect(() => gradeFor(Number.NaN)).toThrow(RangeError);
  });

  it("сохранить можно только целые баллы 0–100", () => {
    expect([0, 59, 100].every(isValidPoints)).toBe(true);
    expect([101, -1, 85.5, Number.NaN, "85", null].some(isValidPoints)).toBe(false);
  });

  it("средний — по выставленным срезам, до 1 знака; ни одного среза — null, а не 0", () => {
    expect(averagePoints([85, null, 90])).toBe(87.5);
    expect(averagePoints([80, 81, 81])).toBe(80.7);
    expect(averagePoints([null, undefined])).toBeNull();
    expect(averagePoints([])).toBeNull();
    expect(scoredAverage([95, 70])).toEqual({ points: 82.5, letter: "B" });
  });

  it("итоговый — среднее из средних дисциплин с оценками, без весов", () => {
    // дисциплина 1: срезы 90, 80 → 85; дисциплина 2: 70 → 70; дисциплина 3: оценок нет
    expect(overallAverage([averagePoints([90, 80]), averagePoints([70]), averagePoints([])])).toBe(77.5);
    expect(overallAverage([null, null])).toBeNull();
  });

  it("подписи: «B (85)», дробные — с запятой", () => {
    expect(formatScored({ points: 85, letter: "B" })).toBe("B (85)");
    expect(formatPoints(84.3)).toBe("84,3");
    expect(formatPoints(80)).toBe("80");
  });

  it("у каждой буквы есть токены цвета в globals.css — светлая и тёмная тема", () => {
    const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
    for (const e of GRADE_SCALE) {
      const token = `--grade-${e.letter.toLowerCase()}`;
      expect(e.cssVar).toBe(`var(${token})`);
      // объявлен дважды (светлая и тёмная тема) + подключён к Tailwind
      expect(css.split(`${token}:`).length - 1, token).toBe(2);
      expect(css.split(`${token}-soft:`).length - 1, `${token}-soft`).toBe(2);
      expect(css).toContain(`--color-grade-${e.letter.toLowerCase()}: var(${token})`);
    }
  });
});

describe("Учебный период", () => {
  it("осенью семестр = 2 × (курс − 1) + 1, весной = 2 × курс", () => {
    expect(semesterForCourse(1)).toBe(1);
    expect(semesterForCourse(2)).toBe(3);
    expect(semesterForCourse(4)).toBe(7);
    expect(semesterForCourse(2, "spring")).toBe(4);
    expect(() => semesterForCourse(0)).toThrow(RangeError);
  });

  it("список семестров для переключателя: у первокурсника только текущий", () => {
    expect(semestersUpTo(1)).toEqual([1]);
    expect(semestersUpTo(3)).toEqual([1, 2, 3, 4, 5]);
    expect(semesterLabel(3)).toBe("3-й семестр");
  });

  it("учебный год и подписи", () => {
    expect(academicYearLabel(2026)).toBe("2026/27");
    expect(academicYearLabel(2099)).toBe("2099/00");
    expect(termLabel()).toBe("осенний семестр 2026/27");
  });

  it("три среза по порядку; идущий срез — по сроку", () => {
    expect(CHECKPOINTS.map((c) => c.no)).toEqual([1, 2, 3]);
    expect(CHECKPOINTS.map((c) => c.due)).toEqual([...CHECKPOINTS.map((c) => c.due)].sort());
    expect(currentCheckpoint("2026-09-15")).toBe(1);
    expect(currentCheckpoint("2026-11-10")).toBe(2);
    expect(currentCheckpoint("2026-11-15")).toBe(2);
    expect(currentCheckpoint("2026-11-16")).toBe(3);
    expect(currentCheckpoint("2026-12-20")).toBeNull();
  });
});
