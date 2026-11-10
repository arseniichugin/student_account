/**
 * Чистые функции экрана «Оценки» студента (lib/grades/stats.ts). База не нужна.
 */
import { describe, expect, it } from "vitest";
import { scored } from "@/lib/grades/scale";
import {
  chartFloor,
  checkpointStats,
  daysUntilLabel,
  disciplineIssues,
  hasFailing,
  overallFromCheckpoints,
  pointsWord,
} from "@/lib/grades/stats";

const d = (points: (number | null)[], finalResult: Parameters<typeof hasFailing>[0]["finalResult"] = null) => ({
  checkpoints: points.map((p) => (p === null ? null : scored(p))),
  finalResult,
});

describe("Проблемные дисциплины", () => {
  it("FX/F за срез — проблема, даже если средний уже выше порога", () => {
    expect(disciplineIssues(d([48, 100, null]))).toEqual({ checkpoints: [1], final: false });
    expect(hasFailing(d([48, 100, null]))).toBe(true);
    expect(disciplineIssues(d([30, 59, 60]))).toEqual({ checkpoints: [1, 2], final: false });
  });

  it("60 баллов (E) — уже не проблема; пустые срезы — тоже", () => {
    expect(hasFailing(d([60, null, null]))).toBe(false);
    expect(hasFailing(d([null, null, null]))).toBe(false);
  });

  it("незачёт и экзамен ниже 60 — проблема итогового контроля", () => {
    expect(disciplineIssues(d([90, 90, 90], { kind: "CREDIT", passed: false })).final).toBe(true);
    expect(disciplineIssues(d([90, 90, 90], { kind: "CREDIT", passed: true })).final).toBe(false);
    expect(disciplineIssues(d([90, 90, 90], { kind: "EXAM", ...scored(59) })).final).toBe(true);
    expect(disciplineIssues(d([90, 90, 90], { kind: "EXAM", ...scored(60) })).final).toBe(false);
  });
});

describe("Динамика по срезам", () => {
  it("средний за срез — только по дисциплинам, где срез выставлен", () => {
    const stats = checkpointStats([d([80, 90, null]), d([90, null, null]), d([null, null, null])]);
    expect(stats.map((s) => [s.no, s.average, s.graded, s.total])).toEqual([
      [1, scored(85), 2, 3],
      [2, scored(90), 1, 3],
      [3, null, 0, 3],
    ]);
    expect(stats[0]!.points).toEqual([80, 90]);
    expect(stats[2]!.due).toBe("2026-12-15");
  });

  it("нижняя граница графика: 50, ниже — с запасом и кратно 10", () => {
    expect(chartFloor([])).toBe(50);
    expect(chartFloor([60, 100])).toBe(50);
    expect(chartFloor([55])).toBe(50);
    expect(chartFloor([48])).toBe(40);
    expect(chartFloor([32])).toBe(20);
    expect(chartFloor([0])).toBe(0);
  });
});

describe("Итоговый балл из строк оценок", () => {
  it("среднее из средних, без весов: как getMyGrades", () => {
    // Ботаника: (48 + 100) / 2 = 74; Зоология: 92 → (74 + 92) / 2 = 83
    const rows = [
      { disciplineId: "bot", points: 48 },
      { disciplineId: "bot", points: 100 },
      { disciplineId: "zoo", points: 92 },
    ];
    expect(overallFromCheckpoints(rows)).toEqual(scored(83));
  });

  it("нет оценок — null, а не 0", () => {
    expect(overallFromCheckpoints([])).toBeNull();
  });
});

describe("Подписи", () => {
  it("через сколько дней", () => {
    expect(daysUntilLabel("2026-11-10", "2026-11-10")).toBe("сегодня");
    expect(daysUntilLabel("2026-11-10", "2026-11-11")).toBe("завтра");
    expect(daysUntilLabel("2026-11-10", "2026-11-15")).toBe("через 5 дней");
    expect(daysUntilLabel("2026-11-10", "2026-12-21")).toBe("через 41 день");
    expect(daysUntilLabel("2026-11-10", "2026-11-08")).toBe("2 дня назад");
  });

  it("балл / балла / баллов", () => {
    expect(pointsWord(1)).toBe("балл");
    expect(pointsWord(83)).toBe("балла");
    expect(pointsWord(85)).toBe("баллов");
    expect(pointsWord(87.4)).toBe("балла");
  });
});
