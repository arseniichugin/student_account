/**
 * Проверка заменяемых файлов вуза (data/university/*): разбор CSV, понятные ошибки,
 * и главное — сломанные файлы не меняют базу.
 *
 * Тест CLI-импорта со сломанными файлами использует базу из DATABASE_URL (.env):
 * он сравнивает её до и после запуска.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseCsv, toCsv } from "@/lib/university-data/csv";
import {
  ROLE_STUDENT,
  credentialsCsv,
  generatePassword,
  readCredentials,
  recoverCredentialsTemp,
} from "@/lib/university-data/credentials";
import { loadUniversityData } from "@/lib/university-data/load";
import { translit } from "@/lib/university-data/translit";
import {
  formatIssue,
  pickTestStudents,
  staffLoginForFaculty,
  validateUniversityData,
  type UniversityFiles,
} from "@/lib/university-data/validate";

const FIXTURES = path.join(__dirname, "fixtures");
const read = (p: string) => readFileSync(path.join(FIXTURES, p), "utf8");

function validFiles(): UniversityFiles {
  return { students: read("valid/students.csv"), schedule: read("valid/schedule.csv"), map: read("valid/campus-map.json") };
}

function errorsOf(files: UniversityFiles): string[] {
  const r = validateUniversityData(files);
  if (r.ok) throw new Error("ожидались ошибки проверки");
  return r.errors.map(formatIssue);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("Разбор CSV", () => {
  it("понимает BOM, «;», кавычки и пустые строки в конце", () => {
    const t = parseCsv('﻿a;b;c\r\n1;"x; y";"он сказал ""да"""\r\n\r\n2;;\r\n\r\n');
    expect(t.delimiter).toBe(";");
    expect(t.headers).toEqual(["a", "b", "c"]);
    expect(t.records.map((r) => r.values)).toEqual([
      ["1", "x; y", 'он сказал "да"'],
      ["2", "", ""],
    ]);
    expect(t.records.map((r) => r.line)).toEqual([2, 4]);
  });

  it("определяет разделитель «,» и файл без BOM", () => {
    const t = parseCsv('a,b\n"1,5",2\n');
    expect(t.delimiter).toBe(",");
    expect(t.records[0]!.values).toEqual(["1,5", "2"]);
  });

  it("перевод строки внутри кавычек не ломает нумерацию строк", () => {
    const t = parseCsv('a;b\n1;"две\nстроки"\n2;x\n');
    expect(t.records.map((r) => r.line)).toEqual([2, 4]);
  });
});

describe("Проверка файлов вуза", () => {
  it("корректный набор проходит, расписание потока не дублируется", () => {
    const r = validateUniversityData(validFiles());
    if (!r.ok) throw new Error(r.errors.map(formatIssue).join("\n"));
    const { data } = r;
    expect(data.students).toHaveLength(3);
    expect(data.faculties.map((f) => f.code)).toEqual(["АЛ", "БТ"]);
    // 7 строк расписания, но занятие 4 — лекция потока для двух групп: одна запись, две группы
    expect(data.scheduleRows).toBe(7);
    expect(data.lessons).toHaveLength(6);
    expect(data.lessons.find((l) => l.oid === "4")!.groups.sort()).toEqual(["1-АЛ-1", "2-БТ-1"]);
    // Кавычки с «;» внутри и онлайн-занятие без аудитории
    const online = data.lessons.find((l) => l.oid === "2")!;
    expect(online.note).toBe("Онлайн; ссылка ниже");
    expect(online.room).toBeNull();
    expect(online.url).toBe("https://test.example.org/meet/2");
    expect(online.status).toBe("NORMAL"); // колонки status нет → normal
    // Группы: языковая подгруппа знает свою академическую; группа без студентов сохраняется
    const lang = data.groups.find((g) => g.name === "1-АЛ-1 (1)")!;
    expect(lang).toMatchObject({ kind: "LANGUAGE", parentName: "1-АЛ-1", course: 1, facultyCode: "АЛ" });
    expect(data.groups.find((g) => g.name === "9-ZZ-9")).toMatchObject({ kind: "OTHER", course: null });
    // Аудитории и корпуса, которых нет на карте, — предупреждение, а не ошибка
    expect(r.warnings.map(formatIssue).join("\n")).toMatch(/аудиторий из расписания нет на карте кампуса.*Зал-1/);
    expect(data.rooms.find((x) => x.number === "Зал-1")).toMatchObject({ onMap: false });
    // Преподаватель: полное ФИО без звания
    expect(data.teachers.find((t) => t.oid === "10")).toMatchObject({ shortName: "Орлов В.П.", fullName: "Орлов Виктор Петрович", rank: "доцент" });
  });

  it("нет обязательной колонки → ошибка с названием колонки", () => {
    const errors = errorsOf({ ...validFiles(), students: read("broken/students-missing-column.csv") });
    expect(errors[0]).toMatch(/^students\.csv, строка 1: нет обязательной колонки «Email»/);
  });

  it("плохая дата → файл, строка, колонка и значение", () => {
    const errors = errorsOf({ ...validFiles(), schedule: read("broken/schedule-bad-date.csv") });
    expect(errors).toContain(
      "schedule.csv, строка 4: колонка «date» — «2026.13.09» не дата в формате ГГГГ.ММ.ДД (например, 2026.09.01)",
    );
  });

  it("неизвестная группа у студента → понятная ошибка", () => {
    const errors = errorsOf({ ...validFiles(), students: read("broken/students-unknown-group.csv") });
    expect(errors).toContain("students.csv, строка 5: колонка «Академическая группа» — группы «2-БТ-9» нет в schedule.csv");
  });

  it("повтор ID студента → ошибка со ссылкой на первую строку", () => {
    const errors = errorsOf({ ...validFiles(), students: read("broken/students-duplicate-id.csv") });
    expect(errors).toContain("students.csv, строка 5: колонка «ID студента» — значение «1001» уже встречалось в строке 2");
  });

  it("противоречивые строки одного занятия и опасная ссылка — ошибки", () => {
    const schedule = read("valid/schedule.csv")
      .replace("4;2026.11.10;09:00;10:20;1;1;Геометрия;Лекция;Орлов В.П.;доцент Орлов Виктор Петрович;10;доцент;2-БТ-1;101", "4;2026.11.10;09:00;10:20;1;1;Геометрия;Лекция;Орлов В.П.;доцент Орлов Виктор Петрович;10;доцент;2-БТ-1;102")
      .replace("https://test.example.org/meet/2", "javascript:alert(1)");
    const errors = errorsOf({ ...validFiles(), schedule });
    expect(errors.some((e) => /строка 6: занятие lessonOid=4 уже было в строке 5, но колонка «auditorium» отличается/.test(e))).toBe(true);
    expect(errors.some((e) => /колонка «url1» — ссылка «javascript:alert\(1\)» должна начинаться с https:\/\//.test(e))).toBe(true);
  });

  it("карта: повтор номера аудитории и неизвестный корпус — ошибки", () => {
    const map = JSON.parse(read("valid/campus-map.json"));
    map.rooms.push({ number: "101", building: "a" }, { number: "999", building: "zzz" });
    const errors = errorsOf({ ...validFiles(), map: JSON.stringify(map) });
    expect(errors).toContain("campus-map.json, rooms[3] (номер «101»): номер аудитории «101» уже есть в rooms[0] — номера должны быть уникальными");
    expect(errors).toContain("campus-map.json, rooms[4] (номер «999»): корпуса «zzz» нет в списке buildings");
  });

  it("нет карты — только предупреждение", () => {
    const r = validateUniversityData({ ...validFiles(), map: null });
    expect(r.ok).toBe(true);
  });

  it("ФИО: буквы любых алфавитов, дефис, апостроф, точка — можно; формула — понятная ошибка", () => {
    const ok = read("valid/students.csv").replace(";Иванова;Мария;Петровна;", ";Д'Артаньян-Мюллер;Мария-Луиза;О’Нил Jr.;");
    expect(validateUniversityData({ ...validFiles(), students: ok }).ok).toBe(true);

    const students = read("valid/students.csv").replace(";Иванова;Мария;", ";=HYPERLINK(1);Мария;").replace(";Олег;", ";<b>Олег</b>;");
    const errors = errorsOf({ ...validFiles(), students });
    expect(errors).toContain("students.csv, строка 2: колонка «Фамилия» — «=HYPERLINK(1)» — допустимы только буквы, пробел, дефис, апостроф и точка");
    expect(errors.some((e) => e.startsWith("students.csv, строка 3: колонка «Имя» — «<b>Олег</b>»"))).toBe(true);
  });

  it("schedule.csv: тексты не длиннее 300 символов, ссылка — не длиннее 2048", () => {
    const schedule = read("valid/schedule.csv")
      .replace(";Алгебра;", `;${"А".repeat(301)};`)
      .replace("https://test.example.org/meet/2", `https://test.example.org/${"x".repeat(2048)}`);
    const errors = errorsOf({ ...validFiles(), schedule });
    expect(errors).toContain("schedule.csv, строка 2: колонка «discipline» — длиннее 300 символов");
    expect(errors).toContain("schedule.csv, строка 3: колонка «url1» — ссылка длиннее 2048 символов");
  });

  it("слишком большой файл не читается — понятная ошибка", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "big-file-"));
    try {
      for (const f of ["students.csv", "schedule.csv", "campus-map.json"]) copyFileSync(path.join(FIXTURES, "valid", f), path.join(dir, f));
      expect(loadUniversityData(dir).ok).toBe(true);
      const r = loadUniversityData(dir, 1024);
      if (r.ok) throw new Error("ожидалась ошибка размера");
      expect(r.errors.map(formatIssue).some((e) => /^schedule\.csv: файл слишком большой: .* МБ, допустимо не больше/.test(e))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("credentials.csv", () => {
  it("значения, похожие на формулы, предваряются апострофом (CSV-инъекция)", () => {
    const csv = toCsv(["a", "b", "c", "d", "e", "f", "g"], [["=1+1", "+7", "-2", "@SUM(A1)", "\tx", "Иванов", "=a;b"]]);
    const values = parseCsv(csv).records[0]!.values;
    expect(values).toEqual(["'=1+1", "'+7", "'-2", "'@SUM(A1)", "'\tx", "Иванов", "'=a;b"]);
  });

  it("после сбоя прошлого импорта .tmp объединяется с основным файлом: берутся только действующие пароли", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "creds-recover-"));
    const file = path.join(dir, "credentials.csv");
    const row = (login: string, password: string) => ({ login, fullName: "Тест", email: "", role: ROLE_STUDENT, password });
    try {
      expect(await recoverCredentialsTemp(file, async () => true)).toBeNull(); // .tmp нет — ничего не делаем

      writeFileSync(file, credentialsCsv([row("a", "old-a"), row("keep", "keep-1")]));
      writeFileSync(`${file}.tmp`, credentialsCsv([row("a", "new-a"), row("b", "new-b"), row("c", "rolled-back"), row("keep", "keep-1")]));
      const valid = new Map([["a", "new-a"], ["b", "new-b"]]);
      const r = await recoverCredentialsTemp(file, async (login, password) => valid.get(login) === password);
      expect(r).toEqual({ recovered: 2, skipped: 1 });
      expect(existsSync(`${file}.tmp`)).toBe(false);
      const rows = readCredentials(file);
      expect([...rows.values()].map((x) => [x.login, x.password]).sort()).toEqual([["a", "new-a"], ["b", "new-b"], ["keep", "keep-1"]]);

      // Повреждённый .tmp не теряется и не ломает основной файл
      writeFileSync(`${file}.tmp`, 'Логин;ФИО;Email;Роль;Пароль\r\nx;"не закрыта;;Студент;p');
      const broken = await recoverCredentialsTemp(file, async () => true);
      expect(broken?.brokenFile).toMatch(/credentials\.csv\.tmp\.broken-\d+$/);
      expect(existsSync(broken!.brokenFile!)).toBe(true);
      expect(readCredentials(file).size).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Аккаунты", () => {
  it("логины деканатов — транслит кода факультета", () => {
    expect(["ГР", "СЛ", "КГ", "ПФ"].map(staffLoginForFaculty)).toEqual(["dekanat.gr", "dekanat.sl", "dekanat.kg", "dekanat.pf"]);
    expect(translit("ЖЩ")).toBe("zhshch");
  });

  it("тестовые студенты: разные факультеты и курсы, выбор детерминирован", () => {
    const r = validateUniversityData(validFiles());
    if (!r.ok) throw new Error("fixture");
    const picked = pickTestStudents(r.data);
    expect(picked.map((s) => s.login)).toEqual(["maria.ivanova", "yan.sidorov", "oleg.petrov"]);
  });

  it("случайный пароль: 12 символов без похожих знаков", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(12);
      expect(p).not.toMatch(/[0O1lIio]/);
    }
  });
});

describe("Импорт со сломанными файлами не меняет базу", () => {
  const cases = [
    ["students.csv", "students-missing-column.csv", "нет обязательной колонки «Email»"],
    ["schedule.csv", "schedule-bad-date.csv", "«2026.13.09» не дата"],
    ["students.csv", "students-unknown-group.csv", "группы «2-БТ-9» нет в schedule.csv"],
    ["students.csv", "students-duplicate-id.csv", "значение «1001» уже встречалось"],
  ] as const;

  async function snapshot() {
    const [users, students, lessons, groups, requests] = await Promise.all([
      db.user.findMany({ select: { login: true, passwordHash: true }, orderBy: { login: "asc" } }),
      db.student.count(),
      db.lesson.count(),
      db.group.count(),
      db.request.count(),
    ]);
    return { users, students, lessons, groups, requests };
  }

  it.each(cases)("%s ← %s", async (target, broken, expected) => {
    const dir = mkdtempSync(path.join(tmpdir(), "import-broken-"));
    try {
      for (const f of ["students.csv", "schedule.csv", "campus-map.json"]) copyFileSync(path.join(FIXTURES, "valid", f), path.join(dir, f));
      copyFileSync(path.join(FIXTURES, "broken", broken), path.join(dir, target));

      const before = await snapshot();
      const run = spawnSync(
        path.join(process.cwd(), "node_modules/.bin/tsx"),
        ["scripts/import-university-data.ts", "--dir", dir, "--credentials", path.join(dir, "credentials.csv")],
        { encoding: "utf8", env: { ...process.env } },
      );
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(expected);
      expect(run.stderr).toMatch(/Найдено \d+ ошиб\S+, база не изменена/);
      expect(await snapshot()).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
