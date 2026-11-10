/**
 * Слой данных расписания (lib/data/schedule.ts).
 * Нужна база с загруженным набором данных: npm run db:setup (или импорт папки UNIVERSITY_DATA_DIR + db:seed).
 *
 * Личное расписание сверяется с подсчётом НАПРЯМУЮ по students.csv и schedule.csv
 * (только разбор CSV и дат, без сборки набора данных из кода импорта).
 * Тест не знает названий групп и дат конкретного вуза: всё берётся из файлов,
 * поэтому проходит и на другом наборе (UNIVERSITY_DATA_DIR=<папка> npm test после импорта этой папки).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StudentContext, UserContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  MAX_RANGE_DAYS,
  ScheduleRangeError,
  escapeLike,
  getGroupSchedule,
  getMyScheduleForDate,
  getMyScheduleForRange,
  getTeacherSchedule,
  listFaculties,
  searchScheduleTargets,
  weekRange,
  type ScheduleLesson,
} from "@/lib/data/schedule";
import { addDaysIso, moscowToday } from "@/lib/moscow-time";
import { parseCsv } from "@/lib/university-data/csv";
import { testLoginsFromEnv } from "@/lib/university-data/import";
import { universityDataDir } from "@/lib/university-data/load";
import { toIsoDate } from "@/lib/university-data/validate";

const DATA = universityDataDir();

function readRows(file: string): Record<string, string>[] {
  const table = parseCsv(readFileSync(path.join(DATA, file), "utf8"));
  return table.records.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r.values[i] ?? ""])));
}

type ScheduleRow = Record<string, string> & { isoDate: string };
const scheduleRows: ScheduleRow[] = readRows("schedule.csv").map((r) => Object.assign(r, { isoDate: toIsoDate(r["date"]!)! }));
const studentRows = readRows("students.csv");
const languageGroupsOf = (r: Record<string, string>) => [r["Языковая группа 1"], r["Языковая группа 2"]].filter((g): g is string => !!g);

const dates = scheduleRows.map((r) => r.isoDate).sort();
const firstDate = dates[0]!;
const lastDate = dates.at(-1)!;
/** Период из данных, который ещё принимает слой расписания (не длиннее MAX_RANGE_DAYS). */
const windowEnd = [addDaysIso(firstDate, MAX_RANGE_DAYS), lastDate].sort()[0]!;
const inWindow = (d: string) => firstDate <= d && d <= windowEnd;

/** Всё расписание за период любой длины — кусками не длиннее MAX_RANGE_DAYS. */
async function inChunks(load: (from: string, to: string) => Promise<ScheduleLesson[]>, from: string, to: string) {
  const all: ScheduleLesson[] = [];
  for (let start = from; start <= to; start = addDaysIso(start, MAX_RANGE_DAYS + 1)) {
    const end = [addDaysIso(start, MAX_RANGE_DAYS), to].sort()[0]!;
    all.push(...(await load(start, end)));
  }
  return all;
}

type TestStudent = { ctx: StudentContext; login: string; groups: string[]; academic: string };
let testStudents: TestStudent[] = [];
let anyUser: UserContext;

beforeAll(async () => {
  const users = await db.user.findMany({
    where: { isDemo: true, role: "STUDENT" },
    orderBy: { login: "asc" },
    select: { id: true, login: true, student: { select: { id: true, facultyId: true } } },
  });
  testStudents = users.map((u) => {
    const row = studentRows.find((r) => r["Email"]!.split("@")[0] === u.login)!;
    return {
      ctx: { userId: u.id, studentId: u.student!.id } as StudentContext,
      login: u.login,
      academic: row["Академическая группа"]!,
      groups: [row["Академическая группа"]!, ...languageGroupsOf(row)],
    };
  });
  anyUser = { userId: users[0]!.id, role: "STUDENT", facultyId: users[0]!.student!.facultyId } as UserContext;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("Личное расписание студента", () => {
  it("есть тестовые студенты (по умолчанию — три)", () => {
    expect(testStudents).toHaveLength(testLoginsFromEnv()?.length ?? 3);
  });

  it("совпадает с подсчётом по schedule.csv и не содержит чужих языковых групп", async () => {
    for (const s of testStudents) {
      const expected = new Set(scheduleRows.filter((r) => s.groups.includes(r["group"]!)).map((r) => r["lessonOid"]));
      const lessons = await inChunks((from, to) => getMyScheduleForRange(s.ctx, from, to), firstDate, lastDate);
      expect(lessons.length, s.login).toBe(expected.size);
      expect(lessons.length).toBeGreaterThan(0);

      // Языковые группы однокурсников по академической группе, в которых студент НЕ состоит (по students.csv)
      const siblings = new Set(
        studentRows
          .filter((r) => r["Академическая группа"] === s.academic)
          .flatMap(languageGroupsOf)
          .filter((g) => !s.groups.includes(g)),
      );
      for (const l of lessons) {
        const names = l.groups.map((g) => g.name);
        expect(names.some((n) => s.groups.includes(n))).toBe(true);
        expect(names.some((n) => siblings.has(n))).toBe(false);
      }
      // Плоские сериализуемые значения
      const l = lessons[0]!;
      expect(l.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(l.start).toMatch(/^\d{2}:\d{2}$/);
      expect(JSON.parse(JSON.stringify(lessons))).toEqual(lessons);
    }
  });

  it("отмены и переносы приходят со статусом и причиной", async () => {
    const s = testStudents[0]!;
    const lessons = await getMyScheduleForRange(s.ctx, firstDate, windowEnd);
    const changed = lessons.filter((l) => l.status !== "normal");
    const isChanged = (status: string | undefined) => !!status && status.toLowerCase() !== "normal";
    const expected = scheduleRows.filter((r) => s.groups.includes(r["group"]!) && isChanged(r["status"]) && inWindow(r.isoDate));
    expect(changed.length).toBe(new Set(expected.map((r) => r["lessonOid"])).size);
    for (const l of changed) expect(l.note).toBeTruthy();
  });

  it("день по умолчанию — сегодня по Москве; неделя — с понедельника", async () => {
    const today = moscowToday(new Date("2026-11-09T21:30:00Z")); // 00:30 10 ноября по Москве
    expect(today).toBe("2026-11-10");
    expect(weekRange("2026-11-12")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    const day = scheduleRows.find((r) => testStudents[0]!.groups.includes(r["group"]!))!.isoDate;
    const lessons = await getMyScheduleForDate(testStudents[0]!.ctx, day);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every((l) => l.date === day)).toBe(true);
    await expect(getMyScheduleForDate(testStudents[0]!.ctx)).resolves.toBeInstanceOf(Array);
  });

  it("слишком длинный или неверный период — ошибка", async () => {
    const ctx = testStudents[0]!.ctx;
    await expect(getMyScheduleForRange(ctx, "2026-01-01", "2027-12-31")).rejects.toBeInstanceOf(ScheduleRangeError);
    await expect(getMyScheduleForRange(ctx, "2026-11-10", "2026-11-01")).rejects.toBeInstanceOf(ScheduleRangeError);
    await expect(getMyScheduleForRange(ctx, "10.11.2026", "2026-11-12")).rejects.toBeInstanceOf(ScheduleRangeError);
    expect(MAX_RANGE_DAYS).toBeGreaterThanOrEqual(150);
  });
});

describe("Поиск и открытое расписание", () => {
  it("поиск находит группы и преподавателей, но не студентов", async () => {
    const student = studentRows[0]!;
    for (const q of [student["Фамилия"]!, student["Имя"]!, student["Email"]!.split("@")[0]!, student["Номер зачётки"]!]) {
      const results = await searchScheduleTargets(anyUser, q);
      for (const r of results) {
        expect(["group", "teacher"]).toContain(r.type);
        const text = JSON.stringify(r);
        expect(text).not.toContain(student["Email"]!);
        expect(text).not.toContain(student["Номер зачётки"]!);
      }
      const ids = results.map((r) => r.id);
      expect(await db.student.count({ where: { OR: [{ id: { in: ids } }, { userId: { in: ids } }] } })).toBe(0);
    }
  });

  it("поиск группы с фильтром по факультету", async () => {
    const faculties = await listFaculties(anyUser);
    expect(faculties.length).toBeGreaterThan(1);
    const f = faculties[0]!;
    // Академическая группа этого факультета — из students.csv, без предположений о формате названия
    const academic = studentRows.find((r) => r["Код факультета"] === f.code)!["Академическая группа"]!;
    const results = await searchScheduleTargets(anyUser, academic.toLowerCase(), { facultyId: f.id });
    expect(results.some((r) => r.type === "group" && r.name === academic)).toBe(true);
    for (const r of results) if (r.type === "group") expect(r.faculty?.id).toBe(f.id);

    const other = faculties[1]!;
    const none = await searchScheduleTargets(anyUser, academic, { facultyId: other.id });
    expect(none.some((r) => r.type === "group" && r.name === academic)).toBe(false);
    expect(await searchScheduleTargets(anyUser, "   ")).toEqual([]);
  });

  it("«%», «_» и «\\» в поиске — обычные символы, а не шаблон LIKE", async () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
    // Без экранирования «%» и «_» нашли бы все группы и всех преподавателей
    expect(await searchScheduleTargets(anyUser, "%")).toEqual([]);
    expect(await searchScheduleTargets(anyUser, "_")).toEqual([]);
    expect(await searchScheduleTargets(anyUser, "\\")).toEqual([]);

    const name = `Тест_поиска%100\\${Date.now()}`;
    const g = await db.group.create({ data: { name, kind: "OTHER" }, select: { id: true } });
    try {
      for (const q of ["_поиска%100\\", "тест_ПОИСКА", "%100\\"]) {
        expect((await searchScheduleTargets(anyUser, q)).map((r) => r.id)).toContain(g.id);
      }
      expect((await searchScheduleTargets(anyUser, "Тест%100")).map((r) => r.id)).not.toContain(g.id);
    } finally {
      await db.group.delete({ where: { id: g.id } });
    }
    // Обычный запрос (в названиях групп бывают дефисы и пробелы) работает как раньше
    const academicGroups = studentRows.map((r) => r["Академическая группа"]!);
    const academic = academicGroups.find((n) => /[-\s]/.test(n)) ?? academicGroups[0]!;
    expect((await searchScheduleTargets(anyUser, academic)).some((r) => r.type === "group" && r.name === academic)).toBe(true);
  });

  it("расписание группы и преподавателя совпадает с CSV", async () => {
    const s = testStudents[0]!;
    const group = await db.group.findUniqueOrThrow({ where: { name: s.academic } });
    const groupRows = scheduleRows.filter((r) => r["group"] === s.academic);
    const week = weekRange(groupRows[Math.floor(groupRows.length / 2)]!.isoDate);
    const res = await getGroupSchedule(anyUser, group.id, week.from, week.to);
    const expected = new Set(groupRows.filter((r) => week.from <= r.isoDate && r.isoDate <= week.to).map((r) => r["lessonOid"]));
    expect(res!.lessons.length).toBe(expected.size);
    expect(res!.group.kind).toBe("academic");
    // Только занятия самой группы — языковые группы перечислены отдельно (subgroups)
    expect(res!.lessons.every((l) => l.groups.some((g) => g.id === group.id))).toBe(true);
    const hasLanguageGroups = studentRows.some((r) => r["Академическая группа"] === s.academic && languageGroupsOf(r).length > 0);
    if (hasLanguageGroups) expect(res!.group.subgroups.length).toBeGreaterThan(0);

    // Ключ преподавателя — как у импорта: lecturerOid, а если его нет — краткое ФИО
    const teacherKey = (r: Record<string, string>) => r["lecturerOid"] || r["lecturer"] || "";
    const oid = teacherKey(scheduleRows.find((r) => teacherKey(r) !== "")!);
    const teacher = await db.teacher.findUniqueOrThrow({ where: { oid } });
    const tRes = await getTeacherSchedule(anyUser, teacher.id, firstDate, windowEnd);
    const tExpected = new Set(scheduleRows.filter((r) => teacherKey(r) === oid && inWindow(r.isoDate)).map((r) => r["lessonOid"]));
    expect(tRes!.lessons.length).toBe(tExpected.size);
    expect(tRes!.lessons.every((l) => l.teacher?.id === teacher.id)).toBe(true);
  });

  it("неизвестная группа или преподаватель → null", async () => {
    expect(await getGroupSchedule(anyUser, "нет-такой", "2026-11-09", "2026-11-15")).toBeNull();
    expect(await getTeacherSchedule(anyUser, "нет-такого", "2026-11-09", "2026-11-15")).toBeNull();
  });
});
