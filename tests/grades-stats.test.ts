/**
 * Чистые функции экрана «Оценки» студента (lib/grades/stats.ts). База не нужна.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRADE_SCALE, scaleEntry, scored } from "@/lib/grades/scale";
import {
  FAILING_ADVICE,
  PASS_POINTS,
  chartFloor,
  checkpointStats,
  daysUntilLabel,
  disciplineIssues,
  failingScaleText,
  finalPassed,
  hasFailing,
  overallFromCheckpoints,
  pointsWord,
  scaleRange,
  worstFailingLetter,
} from "@/lib/grades/stats";

const d = (points: (number | null)[], finalResult: Parameters<typeof hasFailing>[0]["finalResult"] = null) => ({
  checkpoints: points.map((p) => (p === null ? null : scored(p))),
  finalResult,
});

describe("Проблемные дисциплины", () => {
  it("FX/F за срез — проблема, даже если средний уже выше порога", () => {
    expect(disciplineIssues(d([48, 100, null]))).toEqual({ checkpoints: [1], settled: [], final: false });
    expect(hasFailing(d([48, 100, null]))).toBe(true);
    expect(disciplineIssues(d([30, 59, 60]))).toEqual({ checkpoints: [1, 2], settled: [], final: false });
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

  it("сданный зачёт гасит FX/F за срезы: долга больше нет", () => {
    const credited = d([48, 30, null], { kind: "CREDIT", passed: true });
    expect(disciplineIssues(credited)).toEqual({ checkpoints: [], settled: [1, 2], final: false });
    expect(hasFailing(credited)).toBe(false);
    expect(worstFailingLetter(credited)).toBeNull();
  });

  it("экзамен ≥ 60 гасит долг по срезам, экзамен ниже 60 — нет", () => {
    expect(hasFailing(d([48, null, null], { kind: "EXAM", ...scored(60) }))).toBe(false);
    expect(disciplineIssues(d([48, null, null], { kind: "EXAM", ...scored(60) })).settled).toEqual([1]);
    const failedExam = d([48, null, null], { kind: "EXAM", ...scored(59) });
    expect(disciplineIssues(failedExam)).toEqual({ checkpoints: [1], settled: [], final: true });
    expect(hasFailing(failedExam)).toBe(true);
    // «не зачтено» долг не гасит
    expect(hasFailing(d([48, null, null], { kind: "CREDIT", passed: false }))).toBe(true);
  });

  it("итоговый контроль сдан: зачтено или экзамен от 60 баллов", () => {
    expect(finalPassed(null)).toBe(false);
    expect(finalPassed({ kind: "CREDIT", passed: true })).toBe(true);
    expect(finalPassed({ kind: "CREDIT", passed: false })).toBe(false);
    expect(finalPassed({ kind: "EXAM", ...scored(60) })).toBe(true);
    expect(finalPassed({ kind: "EXAM", ...scored(59) })).toBe(false);
  });

  it("худшая буква долга: F («повторить курс») важнее FX («можно пересдать»)", () => {
    expect(worstFailingLetter(d([48, null, null]))).toBe("FX");
    expect(worstFailingLetter(d([48, 30, null]))).toBe("F");
    expect(worstFailingLetter(d([90, null, null], { kind: "CREDIT", passed: false }))).toBe("FX");
    expect(worstFailingLetter(d([90, null, null], { kind: "EXAM", ...scored(20) }))).toBe("F");
    expect(worstFailingLetter(d([90, 80, null]))).toBeNull();
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

describe("Тексты о шкале — из GRADE_SCALE, а не руками", () => {
  it("что делать с долгом — из расшифровки шкалы; пояснение к FX/F и порог сдачи", () => {
    expect(FAILING_ADVICE).toEqual({ FX: "можно пересдать", F: "нужно повторить курс" });
    for (const l of ["FX", "F"] as const) expect(scaleEntry(l).label).toContain(FAILING_ADVICE[l]);
    expect(PASS_POINTS).toBe(60);
    expect(scaleRange("FX")).toBe("35–59");
    expect(failingScaleText(true)).toBe("FX (35–59 баллов) — можно пересдать, F (меньше 35) — нужно повторить курс");
    expect(failingScaleText(false)).toBe("FX — меньше 60 баллов, можно пересдать");
  });

  it("в components/ и app/ нет зашитых границ шкалы в текстах", () => {
    const bounds = new Set(GRADE_SCALE.flatMap((e) => [e.min, e.max]).filter((n) => n > 0 && n < 100));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(process.cwd(), "components"));
    walk(path.join(process.cwd(), "app"));
    // «35–59», «меньше 35», «60 — E», «ниже 60», «от 60 баллов»: число из шкалы рядом с буквой, словом «балл» или сравнением
    const re = /(\d{2})\s*[–-]\s*(\d{2})|(?:меньше|ниже|выше|от|до|не ниже)\s+(\d{2})\b|(\d{2})\s+(?:—\s+[A-F]X?\b|балл)/g;
    const found: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(re)) {
        const nums = m.slice(1).filter(Boolean).map(Number);
        if (nums.some((n) => bounds.has(n))) found.push(`${path.relative(process.cwd(), f)}: ${m[0]}`);
      }
    }
    expect(found).toEqual([]);
  });
});
