/**
 * Проверка и разбор заменяемых файлов вуза (data/university/*).
 *
 * Здесь нет обращений к базе: функция получает тексты файлов и возвращает либо
 * готовый к загрузке набор данных, либо список ошибок «файл, строка: что не так».
 * Поэтому импорт сначала проверяет ВСЁ и только потом трогает базу.
 * Формат файлов описан в data/university/README.md.
 */
import { z } from "zod";
import { isIsoDate } from "../moscow-time";
import { CsvSyntaxError, parseCsv, type CsvTable } from "./csv";
import { translit } from "./translit";

export const STUDENTS_FILE = "students.csv";
export const SCHEDULE_FILE = "schedule.csv";
export const MAP_FILE = "campus-map.json";

/** Логины сотрудников деканата: dekanat.<код факультета латиницей>. */
export const STAFF_LOGIN_PREFIX = "dekanat.";

// ─── Ошибки и предупреждения ────────────────────────────────────────

export type Issue = { file: string; line?: number; where?: string; message: string };

export function formatIssue(issue: Issue): string {
  const place = issue.line ? `, строка ${issue.line}` : issue.where ? `, ${issue.where}` : "";
  return `${issue.file}${place}: ${issue.message}`;
}

const MAX_STORED_ISSUES = 1000;

class Issues {
  readonly errors: Issue[] = [];
  readonly warnings: Issue[] = [];
  errorCount = 0;
  warningCount = 0;

  error(issue: Issue) {
    this.errorCount++;
    if (this.errors.length < MAX_STORED_ISSUES) this.errors.push(issue);
  }
  warn(issue: Issue) {
    this.warningCount++;
    if (this.warnings.length < MAX_STORED_ISSUES) this.warnings.push(issue);
  }
}

// ─── Результат: набор данных для загрузки ───────────────────────────

export type LessonStatusValue = "NORMAL" | "MOVED" | "CANCELLED" | "REPLACED";
export type GroupKindValue = "ACADEMIC" | "LANGUAGE" | "OTHER";

export type FacultyData = { code: string; name: string; sortOrder: number };
export type ProgramData = { facultyCode: string; name: string };
export type GroupData = {
  name: string;
  oid: string | null;
  kind: GroupKindValue;
  course: number | null;
  facultyCode: string | null;
  parentName: string | null;
};
export type StudentData = {
  line: number;
  externalId: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  email: string;
  login: string;
  recordBookNo: string;
  facultyCode: string;
  course: number;
  programName: string;
  academicGroup: string;
  languageGroups: string[];
};
export type TeacherData = { oid: string; shortName: string; fullName: string; rank: string | null; email: string | null };
export type BuildingData = {
  key: string;
  name: string;
  abbr: string | null;
  address: string | null;
  floors: number[];
  wings: (number | null)[] | null;
  maxRoom: number | null;
  scheme: string | null;
  onMap: boolean;
};
export type RoomData = {
  number: string;
  buildingKey: string | null;
  type: string | null;
  capacity: number | null;
  floor: number | null;
  wing: number | null;
  purpose: string | null;
  bookable: boolean;
  onMap: boolean;
};
export type DisciplineData = { name: string; oid: string | null };
export type LessonData = {
  oid: string;
  date: string;
  startTime: string;
  endTime: string;
  pairStart: number | null;
  pairEnd: number | null;
  discipline: string;
  kind: string;
  teacherOid: string | null;
  room: string | null;
  buildingKey: string | null;
  stream: string | null;
  subGroup: string | null;
  note: string | null;
  url: string | null;
  urlDescription: string | null;
  status: LessonStatusValue;
  groups: string[];
};

export type UniversityDataset = {
  faculties: FacultyData[];
  programs: ProgramData[];
  groups: GroupData[];
  students: StudentData[];
  teachers: TeacherData[];
  buildings: BuildingData[];
  rooms: RoomData[];
  disciplines: DisciplineData[];
  lessons: LessonData[];
  /** Сколько строк было в schedule.csv (одна строка = занятие × группа) */
  scheduleRows: number;
};

export type ValidationResult =
  | { ok: true; data: UniversityDataset; warnings: Issue[]; warningCount: number }
  | { ok: false; errors: Issue[]; errorCount: number; warnings: Issue[]; warningCount: number };

export type UniversityFiles = {
  /** Содержимое файлов; null — файла нет. */
  students: string | null;
  schedule: string | null;
  map: string | null;
};

// ─── Общие помощники ────────────────────────────────────────────────

const normHeader = (h: string) => h.trim().toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");

type ColumnSpec = { key: string; header: string; required: boolean };

/** Сопоставляет колонки по заголовкам. Возвращает индексы или null, если нет обязательных. */
function mapColumns(file: string, table: CsvTable, columns: ColumnSpec[], issues: Issues) {
  const byName = new Map<string, number>();
  table.headers.forEach((h, i) => {
    const n = normHeader(h);
    if (n === "") return;
    if (byName.has(n)) {
      issues.error({ file, line: 1, message: `колонка «${h}» повторяется в заголовке дважды` });
    } else {
      byName.set(n, i);
    }
  });
  const index: Record<string, number> = {};
  let ok = true;
  for (const c of columns) {
    const i = byName.get(normHeader(c.header));
    if (i === undefined) {
      if (c.required) {
        ok = false;
        issues.error({
          file,
          line: 1,
          message: `нет обязательной колонки «${c.header}». Найдены колонки: ${table.headers.filter(Boolean).join(", ") || "(пусто)"}`,
        });
      }
      continue;
    }
    index[c.key] = i;
  }
  return ok ? index : null;
}

function rowObject(values: string[], index: Record<string, number>, columns: ColumnSpec[]) {
  const obj: Record<string, string> = {};
  for (const c of columns) {
    const i = index[c.key];
    obj[c.key] = i === undefined ? "" : (values[i] ?? "");
  }
  return obj;
}

function parseTable(file: string, text: string, issues: Issues): CsvTable | null {
  try {
    const table = parseCsv(text);
    if (table.headers.length === 0) {
      issues.error({ file, message: "файл пустой: нет строки заголовков" });
      return null;
    }
    return table;
  } catch (e) {
    if (e instanceof CsvSyntaxError) {
      issues.error({ file, line: e.line, message: e.message });
      return null;
    }
    throw e;
  }
}

function checkRowWidth(file: string, table: CsvTable, issues: Issues) {
  for (const r of table.records) {
    if (r.values.length > table.headers.length) {
      issues.error({
        file,
        line: r.line,
        message: `значений ${r.values.length}, а колонок в заголовке ${table.headers.length} — проверьте разделитель «${table.delimiter === "\t" ? "табуляция" : table.delimiter}» и кавычки`,
      });
    }
  }
}

/** Сообщение zod → «колонка «Курс» — …». */
function zodIssues(
  file: string,
  line: number,
  error: z.ZodError,
  columns: ColumnSpec[],
  issues: Issues,
) {
  for (const iss of error.issues) {
    const key = String(iss.path[0] ?? "");
    const header = columns.find((c) => c.key === key)?.header ?? key;
    issues.error({ file, line, message: `колонка «${header}» — ${iss.message}` });
  }
}

const required = () => z.string().trim().min(1, "пустое значение, а колонка обязательная");
const optional = () => z.string().trim();
const shown = (v: unknown) => `«${String(v)}»`;

function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

// ─── schedule.csv ───────────────────────────────────────────────────

const SCHEDULE_COLUMNS: ColumnSpec[] = [
  { key: "lessonOid", header: "lessonOid", required: true },
  { key: "date", header: "date", required: true },
  { key: "beginLesson", header: "beginLesson", required: true },
  { key: "endLesson", header: "endLesson", required: true },
  { key: "lessonNumberStart", header: "lessonNumberStart", required: false },
  { key: "lessonNumberEnd", header: "lessonNumberEnd", required: false },
  { key: "discipline", header: "discipline", required: true },
  { key: "disciplineOid", header: "disciplineOid", required: false },
  { key: "kindOfWork", header: "kindOfWork", required: true },
  { key: "lecturer", header: "lecturer", required: true },
  { key: "lecturer_title", header: "lecturer_title", required: false },
  { key: "lecturerOid", header: "lecturerOid", required: false },
  { key: "lecturerEmail", header: "lecturerEmail", required: false },
  { key: "lecturer_rank", header: "lecturer_rank", required: false },
  { key: "group", header: "group", required: true },
  { key: "groupOid", header: "groupOid", required: false },
  { key: "stream", header: "stream", required: false },
  { key: "subGroup", header: "subGroup", required: false },
  { key: "auditorium", header: "auditorium", required: true },
  { key: "building", header: "building", required: true },
  { key: "note", header: "note", required: false },
  { key: "url1", header: "url1", required: false },
  { key: "url1_description", header: "url1_description", required: false },
  { key: "status", header: "status", required: false },
];

const DATE_RE = /^(\d{4})[.-](\d{2})[.-](\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

function toIsoDate(v: string): string | null {
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isIsoDate(iso) ? iso : null;
}

function toTime(v: string): string | null {
  const m = TIME_RE.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const STATUS_MAP: Record<string, LessonStatusValue> = {
  "": "NORMAL",
  normal: "NORMAL",
  moved: "MOVED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  replaced: "REPLACED",
};

const scheduleRowSchema = z
  .object({
    lessonOid: required(),
    date: required().refine((v) => toIsoDate(v) !== null, {
      error: (iss) => `${shown(iss.input)} не дата в формате ГГГГ.ММ.ДД (например, 2026.09.01)`,
    }),
    beginLesson: required().refine((v) => toTime(v) !== null, {
      error: (iss) => `${shown(iss.input)} не время в формате ЧЧ:ММ (например, 09:00)`,
    }),
    endLesson: required().refine((v) => toTime(v) !== null, {
      error: (iss) => `${shown(iss.input)} не время в формате ЧЧ:ММ (например, 10:20)`,
    }),
    lessonNumberStart: optional().refine((v) => v === "" || /^\d{1,2}$/.test(v), {
      error: (iss) => `${shown(iss.input)} не номер пары (нужно целое число)`,
    }),
    lessonNumberEnd: optional().refine((v) => v === "" || /^\d{1,2}$/.test(v), {
      error: (iss) => `${shown(iss.input)} не номер пары (нужно целое число)`,
    }),
    discipline: required(),
    disciplineOid: optional(),
    kindOfWork: required(),
    lecturer: optional(),
    lecturer_title: optional(),
    lecturerOid: optional(),
    lecturerEmail: optional(),
    lecturer_rank: optional(),
    group: required(),
    groupOid: optional(),
    stream: optional(),
    subGroup: optional(),
    auditorium: optional(),
    building: optional(),
    note: optional(),
    url1: optional().refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
      // Ссылка показывается студенту как кнопка — допускаем только http(s), никаких javascript:.
      error: (iss) => `ссылка ${shown(iss.input)} должна начинаться с https:// или http://`,
    }),
    url1_description: optional(),
    status: optional().refine((v) => v.toLowerCase() in STATUS_MAP, {
      error: (iss) => `неизвестный статус ${shown(iss.input)}; допустимо: normal, moved, cancelled, replaced или пусто`,
    }),
  })
  .superRefine((row, ctx) => {
    const b = toTime(row.beginLesson);
    const e = toTime(row.endLesson);
    if (b && e && e <= b) {
      ctx.addIssue({ code: "custom", path: ["endLesson"], message: `конец ${e} не позже начала ${b}` });
    }
  });

type ScheduleRow = z.infer<typeof scheduleRowSchema>;

/** Поля, которые у всех строк одного занятия (lessonOid) должны совпадать. */
const LESSON_SAME_FIELDS: (keyof ScheduleRow)[] = [
  "date",
  "beginLesson",
  "endLesson",
  "discipline",
  "kindOfWork",
  "lecturerOid",
  "lecturer",
  "auditorium",
  "building",
  "status",
];

type ParsedSchedule = {
  rows: { line: number; row: ScheduleRow }[];
  groupNames: Set<string>;
  totalRows: number;
};

function validateSchedule(text: string, issues: Issues): ParsedSchedule | null {
  const file = SCHEDULE_FILE;
  const table = parseTable(file, text, issues);
  if (!table) return null;
  const index = mapColumns(file, table, SCHEDULE_COLUMNS, issues);
  if (!index) return null;
  checkRowWidth(file, table, issues);
  if (table.records.length === 0) {
    issues.error({ file, message: "в файле нет ни одного занятия" });
    return null;
  }

  const rows: ParsedSchedule["rows"] = [];
  const firstByLesson = new Map<string, { line: number; row: ScheduleRow }>();
  const seenPairs = new Set<string>();
  for (const rec of table.records) {
    const parsed = scheduleRowSchema.safeParse(rowObject(rec.values, index, SCHEDULE_COLUMNS));
    if (!parsed.success) {
      zodIssues(file, rec.line, parsed.error, SCHEDULE_COLUMNS, issues);
      continue;
    }
    const row = parsed.data;
    const pairKey = `${row.lessonOid}\u0000${row.group}`;
    if (seenPairs.has(pairKey)) {
      issues.warn({ file, line: rec.line, message: `строка повторяет занятие ${row.lessonOid} для группы «${row.group}» — пропущена` });
      continue;
    }
    seenPairs.add(pairKey);
    const first = firstByLesson.get(row.lessonOid);
    if (first) {
      const diff = LESSON_SAME_FIELDS.find((f) => first.row[f] !== row[f]);
      if (diff) {
        issues.error({
          file,
          line: rec.line,
          message: `занятие lessonOid=${row.lessonOid} уже было в строке ${first.line}, но колонка «${diff}» отличается: ${shown(first.row[diff])} и ${shown(row[diff])}. Строки одного занятия (лекции потока) должны совпадать во всём, кроме группы`,
        });
        continue;
      }
    } else {
      firstByLesson.set(row.lessonOid, { line: rec.line, row });
    }
    rows.push({ line: rec.line, row });
  }
  return { rows, groupNames: new Set(rows.map((r) => r.row.group)), totalRows: table.records.length };
}

// ─── students.csv ───────────────────────────────────────────────────

const STUDENT_COLUMNS: ColumnSpec[] = [
  { key: "externalId", header: "ID студента", required: true },
  { key: "lastName", header: "Фамилия", required: true },
  { key: "firstName", header: "Имя", required: true },
  { key: "middleName", header: "Отчество", required: false },
  { key: "email", header: "Email", required: true },
  { key: "recordBookNo", header: "Номер зачётки", required: true },
  { key: "facultyName", header: "Факультет", required: true },
  { key: "facultyCode", header: "Код факультета", required: true },
  { key: "course", header: "Курс", required: true },
  { key: "program", header: "Направление", required: true },
  { key: "academicGroup", header: "Академическая группа", required: true },
  { key: "languageGroup1", header: "Языковая группа 1", required: false },
  { key: "languageGroup2", header: "Языковая группа 2", required: false },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const studentRowSchema = z.object({
  externalId: required().max(64, "слишком длинное значение (больше 64 символов)"),
  lastName: required().max(100, "слишком длинное значение"),
  firstName: required().max(100, "слишком длинное значение"),
  middleName: optional().max(100, "слишком длинное значение"),
  email: required()
    .refine((v) => EMAIL_RE.test(v), { error: (iss) => `${shown(iss.input)} не адрес электронной почты` })
    .refine((v) => LOGIN_RE.test(v.split("@")[0]!.toLowerCase()), {
      error: (iss) =>
        `из адреса ${shown(iss.input)} не получается логин: до «@» допустимы латинские буквы, цифры, точка, дефис и подчёркивание (до 64 символов)`,
    }),
  recordBookNo: required().max(64, "слишком длинное значение"),
  facultyName: required(),
  facultyCode: required().max(20, "код факультета длиннее 20 символов"),
  course: required().refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 10, {
    error: (iss) => `курс ${shown(iss.input)} должен быть целым числом от 1 до 10`,
  }),
  program: required(),
  academicGroup: required(),
  languageGroup1: optional(),
  languageGroup2: optional(),
});

type ParsedStudents = StudentData[];

function validateStudents(text: string, scheduleGroups: Set<string> | null, issues: Issues) {
  const file = STUDENTS_FILE;
  const table = parseTable(file, text, issues);
  if (!table) return null;
  const index = mapColumns(file, table, STUDENT_COLUMNS, issues);
  if (!index) return null;
  checkRowWidth(file, table, issues);
  if (table.records.length === 0) {
    issues.error({ file, message: "в файле нет ни одного студента" });
    return null;
  }

  const students: ParsedStudents = [];
  const unique = {
    externalId: new Map<string, number>(),
    email: new Map<string, number>(),
    recordBookNo: new Map<string, number>(),
    login: new Map<string, number>(),
  };
  const facultyNames = new Map<string, { name: string; line: number }>();
  const groupUse = new Map<string, { as: "academic" | "language"; line: number }>();
  const academicInfo = new Map<string, { course: number; facultyCode: string; line: number }>();

  for (const rec of table.records) {
    const parsed = studentRowSchema.safeParse(rowObject(rec.values, index, STUDENT_COLUMNS));
    if (!parsed.success) {
      zodIssues(file, rec.line, parsed.error, STUDENT_COLUMNS, issues);
      continue;
    }
    const r = parsed.data;
    const line = rec.line;
    let rowOk = true;
    const err = (key: string, message: string) => {
      rowOk = false;
      const header = STUDENT_COLUMNS.find((c) => c.key === key)!.header;
      issues.error({ file, line, message: `колонка «${header}» — ${message}` });
    };

    const email = r.email.toLowerCase();
    const login = email.split("@")[0]!;
    const checkUnique = (map: Map<string, number>, key: string, value: string, what = "значение") => {
      const prev = map.get(value);
      if (prev !== undefined) err(key, `${what} ${shown(value)} уже встречалось в строке ${prev}`);
      else map.set(value, line);
    };
    checkUnique(unique.externalId, "externalId", r.externalId);
    checkUnique(unique.email, "email", email);
    checkUnique(unique.recordBookNo, "recordBookNo", r.recordBookNo);
    if (login.startsWith(STAFF_LOGIN_PREFIX)) {
      err("email", `логин ${shown(login)} начинается с «${STAFF_LOGIN_PREFIX}» — такие логины зарезервированы для деканатов`);
    } else {
      checkUnique(unique.login, "email", login, "логин (часть адреса до «@»)");
    }

    const fac = facultyNames.get(r.facultyCode);
    if (!fac) facultyNames.set(r.facultyCode, { name: r.facultyName, line });
    else if (fac.name !== r.facultyName) {
      err("facultyName", `у кода ${shown(r.facultyCode)} в строке ${fac.line} указан факультет ${shown(fac.name)}, а здесь ${shown(r.facultyName)}`);
    }

    const course = Number(r.course);
    const languageGroups = [r.languageGroup1, r.languageGroup2].filter((g) => g !== "");
    if (languageGroups.length === 2 && languageGroups[0] === languageGroups[1]) {
      err("languageGroup2", `та же группа, что и в колонке «Языковая группа 1»: ${shown(languageGroups[0])}`);
    }
    const groupCols: [string, string, "academic" | "language"][] = [
      ["academicGroup", r.academicGroup, "academic"],
      ["languageGroup1", r.languageGroup1, "language"],
      ["languageGroup2", r.languageGroup2, "language"],
    ];
    for (const [key, name, as] of groupCols) {
      if (name === "") continue;
      if (scheduleGroups && !scheduleGroups.has(name)) {
        err(key, `группы ${shown(name)} нет в ${SCHEDULE_FILE}`);
        continue;
      }
      const used = groupUse.get(name);
      if (!used) groupUse.set(name, { as, line });
      else if (used.as !== as) {
        err(
          key,
          `группа ${shown(name)} в строке ${used.line} указана как ${used.as === "academic" ? "академическая" : "языковая"}, а здесь — как ${as === "academic" ? "академическая" : "языковая"}`,
        );
      }
    }
    const acad = academicInfo.get(r.academicGroup);
    if (!acad) academicInfo.set(r.academicGroup, { course, facultyCode: r.facultyCode, line });
    else if (acad.course !== course || acad.facultyCode !== r.facultyCode) {
      err(
        "academicGroup",
        `у группы ${shown(r.academicGroup)} в строке ${acad.line} курс ${acad.course} и факультет ${shown(acad.facultyCode)}, а здесь курс ${course} и факультет ${shown(r.facultyCode)}`,
      );
    }

    if (!rowOk) continue;
    students.push({
      line,
      externalId: r.externalId,
      lastName: r.lastName,
      firstName: r.firstName,
      middleName: r.middleName || null,
      email,
      login,
      recordBookNo: r.recordBookNo,
      facultyCode: r.facultyCode,
      course,
      programName: r.program,
      academicGroup: r.academicGroup,
      languageGroups,
    });
  }

  // Логины деканатов не должны совпасть между факультетами (например, «Мат» и «МАТ»).
  const staffLogins = new Map<string, string>();
  for (const code of facultyNames.keys()) {
    const login = staffLoginForFaculty(code);
    const prev = staffLogins.get(login);
    if (prev) {
      issues.error({
        file,
        message: `коды факультетов ${shown(prev)} и ${shown(code)} дают одинаковый логин деканата ${shown(login)} — сделайте коды различимыми`,
      });
    }
    staffLogins.set(login, code);
  }

  return { students, facultyNames };
}

export function staffLoginForFaculty(code: string): string {
  return `${STAFF_LOGIN_PREFIX}${translit(code) || "faculty"}`;
}

// ─── campus-map.json ────────────────────────────────────────────────

const nullableString = z.string().trim().nullish();
const mapBuildingSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1, "пустое значение")),
  name: z.string("ожидается строка").trim().min(1, "пустое значение"),
  abbr: nullableString,
  address: nullableString,
  floors: z.array(z.number().int(), "ожидается список целых чисел").nullish(),
  wings: z.array(z.number().int().nullable(), "ожидается список чисел").nullish(),
  maxRoom: z.number("ожидается число").int().nullish(),
  scheme: nullableString,
});
const mapRoomSchema = z.object({
  number: z.union([z.string(), z.number()], "ожидается строка").transform(String).pipe(z.string().trim().min(1, "пустое значение")),
  building: z.union([z.string(), z.number()], "ожидается id корпуса").transform(String).pipe(z.string().trim().min(1, "пустое значение")),
  type: nullableString,
  capacity: z.number("ожидается число").int().min(0, "не может быть меньше 0").nullish(),
  floor: z.number("ожидается число").int().nullish(),
  wing: z.number("ожидается число").int().nullish(),
  purpose: nullableString,
  bookable: z.boolean("ожидается true или false").nullish(),
});
const mapRootSchema = z.object({
  buildings: z.array(z.unknown(), "ожидается список корпусов"),
  rooms: z.array(z.unknown(), "ожидается список аудиторий"),
});

type ParsedMap = { buildings: BuildingData[]; rooms: RoomData[] };

function validateMap(text: string, issues: Issues): ParsedMap | null {
  const file = MAP_FILE;
  let json: unknown;
  try {
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    issues.error({ file, message: `не получается прочитать JSON: ${(e as Error).message}` });
    return null;
  }
  const root = mapRootSchema.safeParse(json);
  if (!root.success) {
    for (const iss of root.error.issues) {
      issues.error({ file, message: `поле «${iss.path.join(".") || "(корень)"}» — ${iss.message}` });
    }
    return null;
  }
  const buildings: BuildingData[] = [];
  const buildingIds = new Map<string, number>();
  const buildingNames = new Map<string, number>();
  root.data.buildings.forEach((raw, i) => {
    const where = `buildings[${i}]`;
    const b = mapBuildingSchema.safeParse(raw);
    if (!b.success) {
      for (const iss of b.error.issues) issues.error({ file, where, message: `поле «${iss.path.join(".")}» — ${iss.message}` });
      return;
    }
    const d = b.data;
    if (buildingIds.has(d.id)) {
      issues.error({ file, where, message: `id корпуса ${shown(d.id)} уже есть в buildings[${buildingIds.get(d.id)}]` });
      return;
    }
    if (buildingNames.has(d.name)) {
      issues.error({ file, where, message: `название корпуса ${shown(d.name)} уже есть в buildings[${buildingNames.get(d.name)}]` });
      return;
    }
    buildingIds.set(d.id, i);
    buildingNames.set(d.name, i);
    buildings.push({
      key: d.id,
      name: d.name,
      abbr: d.abbr ?? null,
      address: d.address ?? null,
      floors: d.floors ?? [],
      wings: d.wings ?? null,
      maxRoom: d.maxRoom ?? null,
      scheme: d.scheme ?? null,
      onMap: true,
    });
  });

  const rooms: RoomData[] = [];
  const roomNumbers = new Map<string, number>();
  root.data.rooms.forEach((raw, i) => {
    const r = mapRoomSchema.safeParse(raw);
    const num = (raw as { number?: unknown } | null)?.number;
    const where = `rooms[${i}]${num !== undefined ? ` (номер ${shown(num)})` : ""}`;
    if (!r.success) {
      for (const iss of r.error.issues) issues.error({ file, where, message: `поле «${iss.path.join(".")}» — ${iss.message}` });
      return;
    }
    const d = r.data;
    if (roomNumbers.has(d.number)) {
      issues.error({ file, where, message: `номер аудитории ${shown(d.number)} уже есть в rooms[${roomNumbers.get(d.number)}] — номера должны быть уникальными` });
      return;
    }
    if (!buildingIds.has(d.building)) {
      issues.error({ file, where, message: `корпуса ${shown(d.building)} нет в списке buildings` });
      return;
    }
    roomNumbers.set(d.number, i);
    rooms.push({
      number: d.number,
      buildingKey: d.building,
      type: d.type ?? null,
      capacity: d.capacity ?? null,
      floor: d.floor ?? null,
      wing: d.wing ?? null,
      purpose: d.purpose ?? null,
      bookable: d.bookable ?? true,
      onMap: true,
    });
  });
  return { buildings, rooms };
}

// ─── Сборка набора данных ───────────────────────────────────────────

const LANGUAGE_GROUP_RE = /^(.*\S)\s*\(\s*\d+\s*\)$/;

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function buildDataset(
  schedule: ParsedSchedule,
  students: StudentData[],
  facultyNames: Map<string, { name: string; line: number }>,
  map: ParsedMap | null,
  issues: Issues,
): UniversityDataset {
  // Факультеты — в порядке первого появления в students.csv
  const faculties: FacultyData[] = [...facultyNames.entries()]
    .sort((a, b) => a[1].line - b[1].line)
    .map(([code, f], i) => ({ code, name: f.name, sortOrder: i + 1 }));

  const programKeys = new Map<string, ProgramData>();
  for (const s of students) programKeys.set(`${s.facultyCode}\u0000${s.programName}`, { facultyCode: s.facultyCode, name: s.programName });

  // Группы
  const groupOid = new Map<string, string>();
  for (const { row } of schedule.rows) if (row.groupOid && !groupOid.has(row.group)) groupOid.set(row.group, row.groupOid);
  const academic = new Map<string, StudentData[]>();
  const language = new Map<string, StudentData[]>();
  for (const s of students) {
    academic.set(s.academicGroup, [...(academic.get(s.academicGroup) ?? []), s]);
    for (const g of s.languageGroups) language.set(g, [...(language.get(g) ?? []), s]);
  }
  const groups: GroupData[] = [];
  const groupByName = new Map<string, GroupData>();
  const allNames = [...new Set([...schedule.groupNames, ...academic.keys(), ...language.keys()])].sort();
  for (const name of allNames) {
    let g: GroupData;
    const acadMembers = academic.get(name);
    const langMembers = language.get(name);
    if (acadMembers) {
      g = {
        name,
        oid: groupOid.get(name) ?? null,
        kind: "ACADEMIC",
        course: acadMembers[0]!.course,
        facultyCode: acadMembers[0]!.facultyCode,
        parentName: null,
      };
    } else if (langMembers) {
      g = {
        name,
        oid: groupOid.get(name) ?? null,
        kind: "LANGUAGE",
        course: mostCommon(langMembers.map((s) => s.course)),
        facultyCode: mostCommon(langMembers.map((s) => s.facultyCode)),
        parentName: mostCommon(langMembers.map((s) => s.academicGroup)),
      };
    } else {
      const m = LANGUAGE_GROUP_RE.exec(name);
      const parent = m && academic.get(m[1]!) ? m[1]! : null;
      const parentInfo = parent ? academic.get(parent)![0]! : null;
      g = {
        name,
        oid: groupOid.get(name) ?? null,
        kind: parent ? "LANGUAGE" : "OTHER",
        course: parentInfo?.course ?? null,
        facultyCode: parentInfo?.facultyCode ?? null,
        parentName: parent,
      };
    }
    groups.push(g);
    groupByName.set(name, g);
  }
  const withoutStudents = groups.filter((g) => !academic.has(g.name) && !language.has(g.name));
  if (withoutStudents.length > 0) {
    issues.warn({
      file: SCHEDULE_FILE,
      message: `${withoutStudents.length} групп(ы) из расписания нет ни у одного студента — они сохранятся и будут видны в поиске расписания: ${withoutStudents
        .slice(0, 10)
        .map((g) => g.name)
        .join(", ")}${withoutStudents.length > 10 ? "…" : ""}`,
    });
  }

  // Корпуса и аудитории: сначала карта, потом то, что есть только в расписании
  const buildings: BuildingData[] = [...(map?.buildings ?? [])];
  const buildingByName = new Map(buildings.map((b) => [b.name, b]));
  const buildingByKey = new Map(buildings.map((b) => [b.key, b]));
  const rooms: RoomData[] = [...(map?.rooms ?? [])];
  const roomByNumber = new Map(rooms.map((r) => [r.number, r]));
  const missingBuildings = new Set<string>();
  const missingRooms = new Set<string>();
  const mismatchedRooms = new Set<string>();

  const resolveBuilding = (name: string): BuildingData | null => {
    if (name === "") return null;
    let b = buildingByName.get(name) ?? null;
    if (!b) {
      let key = name;
      for (let i = 2; buildingByKey.has(key); i++) key = `${name}-${i}`;
      b = { key, name, abbr: null, address: null, floors: [], wings: null, maxRoom: null, scheme: null, onMap: false };
      buildings.push(b);
      buildingByName.set(name, b);
      buildingByKey.set(key, b);
      if (map) missingBuildings.add(name);
    }
    return b;
  };

  // Преподаватели и дисциплины
  const teachers = new Map<string, TeacherData>();
  const disciplines = new Map<string, DisciplineData>();
  const lessons = new Map<string, LessonData>();

  for (const { row } of schedule.rows) {
    const building = resolveBuilding(row.building);
    let room: RoomData | null = null;
    if (row.auditorium !== "") {
      room = roomByNumber.get(row.auditorium) ?? null;
      if (!room) {
        room = {
          number: row.auditorium,
          buildingKey: building?.key ?? null,
          type: null,
          capacity: null,
          floor: null,
          wing: null,
          purpose: null,
          bookable: true,
          onMap: false,
        };
        rooms.push(room);
        roomByNumber.set(room.number, room);
        if (map) missingRooms.add(room.number);
      } else if (building && room.buildingKey && room.buildingKey !== building.key) {
        mismatchedRooms.add(`${room.number} (в расписании — ${building.name}, на карте — ${buildingByKey.get(room.buildingKey)?.name})`);
      }
    }

    let teacherOid: string | null = null;
    if (row.lecturer !== "" || row.lecturerOid !== "") {
      teacherOid = row.lecturerOid || row.lecturer;
      if (!teachers.has(teacherOid)) {
        const rank = row.lecturer_rank || null;
        let fullName = row.lecturer_title || row.lecturer || teacherOid;
        if (rank && fullName.startsWith(`${rank} `)) fullName = fullName.slice(rank.length + 1).trim();
        teachers.set(teacherOid, {
          oid: teacherOid,
          shortName: row.lecturer || fullName,
          fullName,
          rank,
          email: row.lecturerEmail || null,
        });
      }
    }
    if (!disciplines.has(row.discipline)) disciplines.set(row.discipline, { name: row.discipline, oid: row.disciplineOid || null });

    const existing = lessons.get(row.lessonOid);
    if (existing) {
      existing.groups.push(row.group);
      continue;
    }
    const pairStart = row.lessonNumberStart ? Number(row.lessonNumberStart) : null;
    lessons.set(row.lessonOid, {
      oid: row.lessonOid,
      date: toIsoDate(row.date)!,
      startTime: toTime(row.beginLesson)!,
      endTime: toTime(row.endLesson)!,
      pairStart,
      pairEnd: row.lessonNumberEnd ? Number(row.lessonNumberEnd) : pairStart,
      discipline: row.discipline,
      kind: row.kindOfWork,
      teacherOid,
      room: room?.number ?? null,
      buildingKey: building?.key ?? room?.buildingKey ?? null,
      stream: row.stream || null,
      subGroup: row.subGroup || null,
      note: row.note || null,
      url: row.url1 || null,
      urlDescription: row.url1_description || null,
      status: STATUS_MAP[row.status.toLowerCase()]!,
      groups: [row.group],
    });
  }

  const list = (s: Set<string>) => {
    const arr = [...s].sort();
    return arr.slice(0, 15).join(", ") + (arr.length > 15 ? ` и ещё ${arr.length - 15}` : "");
  };
  if (!map) {
    issues.warn({ file: MAP_FILE, message: "файла нет — корпуса и аудитории будут взяты только из расписания, без этажей и вместимости" });
  }
  if (missingRooms.size > 0) {
    issues.warn({ file: SCHEDULE_FILE, message: `${missingRooms.size} аудиторий из расписания нет на карте кампуса (занятия загрузятся, но без схемы проезда): ${list(missingRooms)}` });
  }
  if (missingBuildings.size > 0) {
    issues.warn({ file: SCHEDULE_FILE, message: `корпусов нет на карте кампуса: ${list(missingBuildings)}` });
  }
  if (mismatchedRooms.size > 0) {
    issues.warn({ file: SCHEDULE_FILE, message: `аудитории числятся в разных корпусах в расписании и на карте: ${list(mismatchedRooms)}` });
  }

  return {
    faculties,
    programs: [...programKeys.values()],
    groups,
    students,
    teachers: [...teachers.values()],
    buildings,
    rooms,
    disciplines: [...disciplines.values()],
    lessons: [...lessons.values()],
    scheduleRows: schedule.totalRows,
  };
}

/** Проверяет все три файла и собирает набор данных. База не используется. */
export function validateUniversityData(files: UniversityFiles): ValidationResult {
  const issues = new Issues();

  let schedule: ParsedSchedule | null = null;
  if (files.schedule === null) issues.error({ file: SCHEDULE_FILE, message: "файл не найден" });
  else schedule = validateSchedule(files.schedule, issues);

  let studentsResult: ReturnType<typeof validateStudents> = null;
  if (files.students === null) issues.error({ file: STUDENTS_FILE, message: "файл не найден" });
  else studentsResult = validateStudents(files.students, schedule?.groupNames ?? null, issues);

  const map = files.map === null ? null : validateMap(files.map, issues);

  if (issues.errorCount > 0 || !schedule || !studentsResult || (files.map !== null && !map)) {
    return { ok: false, errors: issues.errors, errorCount: Math.max(issues.errorCount, 1), warnings: issues.warnings, warningCount: issues.warningCount };
  }
  const data = buildDataset(schedule, studentsResult.students, studentsResult.facultyNames, map, issues);
  return { ok: true, data, warnings: issues.warnings, warningCount: issues.warningCount };
}

// ─── Тестовые аккаунты для жюри ─────────────────────────────────────

/**
 * Детерминированно выбирает до трёх тестовых студентов: факультеты №1, №2, №3
 * (порядок первого появления в students.csv) и курсы 1-й, 2-й, 3-й по возрастанию;
 * в каждой паре «факультет + курс» — студент с наименьшим ID.
 */
export function pickTestStudents(data: Pick<UniversityDataset, "faculties" | "students">, count = 3): StudentData[] {
  const faculties = [...data.faculties].sort((a, b) => a.sortOrder - b.sortOrder).map((f) => f.code);
  const courses = [...new Set(data.students.map((s) => s.course))].sort((a, b) => a - b);
  const sorted = [...data.students].sort((a, b) => compareIds(a.externalId, b.externalId));
  const picked: StudentData[] = [];
  for (let i = 0; i < Math.min(count, sorted.length); i++) {
    const fac = faculties[i % faculties.length];
    const course = courses[i % courses.length];
    const free = sorted.filter((s) => !picked.includes(s));
    const choice =
      free.find((s) => s.facultyCode === fac && s.course === course) ?? free.find((s) => s.facultyCode === fac) ?? free[0];
    if (choice) picked.push(choice);
  }
  return picked;
}
