import "server-only";
import type { StaffContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  buildSemesterGrades,
  loadStudentGrades,
  teacherSelect,
  type MyGrades,
  type SemesterAssignmentRow,
} from "@/lib/data/grades";
import { escapeLike } from "@/lib/data/schedule";
import { hasLatin, isTranslitWord, latinKey, latinLookalikesToCyrillic, qwertyToCyrillic } from "@/lib/latin-search";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  cohortSummary,
  debtDisciplines,
  disciplineAverage,
  isCheckpointGraded,
  type CohortSummary,
  type DebtDiscipline,
} from "@/lib/grades/course-stats";
import type { ScoredGrade } from "@/lib/grades/scale";
import { currentCheckpoint, semesterForCourse, type CheckpointNo } from "@/lib/grades/term";
import { moscowToday } from "@/lib/moscow-time";
import { STUDENT_SEARCH_LIMIT, STUDENT_SEARCH_MAX_LENGTH, STUDENT_SEARCH_MIN_LENGTH } from "@/lib/validation/dean-grades";

// Успеваемость для деканата (только чтение).
// ПРАВИЛА:
//  — сотрудник видит студентов, группы и оценки ТОЛЬКО своего факультета: фильтр — ctx.facultyId из сессии,
//    никогда не из адреса. Чужая или несуществующая группа/зачётка → null («Не найдено», страница — 404);
//  — оценки считаются той же функцией, что у студента (buildSemesterGrades из lib/data/grades.ts):
//    средний по дисциплине, итоговый балл «среднее из средних» и долг (hasFailing) — одно правило;
//  — курс и группа читаются пачкой (без запроса на каждого студента): студенты → дисциплины их групп
//    одним SQL → назначения → оценки;
//  — наружу — только то, что нужно экрану: ФИО, зачётка, группа, оценки. Без id пользователя, почты, логина.

// ─── Типы для экранов ───────────────────────────────────────────────

export type DeanGroupRef = { id: string; name: string };

/** Студент в списках деканата (группа риска, таблица группы, поиск). */
export type DeanStudent = {
  recordBookNo: string;
  /** «Фамилия Имя Отчество» */
  fullName: string;
  group: DeanGroupRef;
  course: number;
};

export type CourseGroup = DeanGroupRef & { summary: CohortSummary };

/** Заполнение журнала: дисциплина × группа × преподаватель, текущий срез. */
export type JournalFill = {
  assignmentId: string;
  discipline: string;
  group: DeanGroupRef & { kind: "academic" | "language" | "other" };
  teacher: { shortName: string; fullName: string };
  graded: number;
  total: number;
};

export type RiskStudent = DeanStudent & { overall: ScoredGrade | null; debts: DebtDiscipline[] };

export type CourseOverview = {
  faculty: string;
  /** Курсы факультета, где есть студенты: 1 … N */
  courses: number[];
  course: number;
  summary: CohortSummary;
  /** Академические группы курса по названию */
  groups: CourseGroup[];
  /** Пары «дисциплина × группа × преподаватель», сначала самые отстающие */
  journals: JournalFill[];
  /** Студенты с непогашенным FX/F, по ФИО */
  risk: RiskStudent[];
  /** Дисциплины, по которым есть долги, — для фильтра группы риска */
  riskDisciplines: { id: string; name: string; count: number }[];
  /** Пример номера зачётки для подсказок поиска — первая зачётка курса (у каждого факультета своя) */
  sampleRecordBook: string | null;
};

/** Средний балл студента по дисциплине; average = null — «нет оценок». */
export type GroupCell = { disciplineId: string; discipline: string; average: ScoredGrade | null };

export type GroupGradesRow = DeanStudent & {
  overall: ScoredGrade | null;
  debts: DebtDiscipline[];
  /** Дисциплины академической группы: id дисциплины → средний (null — нет оценок) */
  cells: Record<string, ScoredGrade | null>;
  /**
   * Дисциплины языковых групп студента — по номеру языковой группы (1-я, 2-я): у соседей по группе
   * они разные (разные языки), поэтому это отдельные колонки «1-й язык», «2-й язык», а не по колонке на язык
   */
  languages: GroupCell[][];
};

export type GroupGrades = {
  group: DeanGroupRef & { course: number | null };
  summary: CohortSummary;
  /** Колонки дисциплин академической группы по названию и средний группы по каждой */
  disciplines: { id: string; name: string; average: ScoredGrade | null }[];
  /** Сколько колонок языковых групп (у студента их 0–2) */
  languageColumns: number;
  /** Студенты по ФИО */
  students: GroupGradesRow[];
};

export type DeanStudentGrades = {
  student: DeanStudent & { faculty: string };
  grades: MyGrades;
};

export type StudentSearchResult = {
  /** Зачётка совпала полностью — сразу открыть студента */
  exact: string | null;
  results: DeanStudent[];
  /** Нашлось только в русской раскладке: исправленный запрос («jhkjdf» → «орлова») — для подсказки про раскладку */
  layout?: string;
};

// ─── Помощники ──────────────────────────────────────────────────────

const byRu = (a: string, b: string) => a.localeCompare(b, "ru");

const studentSelect = {
  id: true,
  lastName: true,
  firstName: true,
  middleName: true,
  recordBookNo: true,
  course: true,
  academicGroupId: true,
  academicGroup: { select: { id: true, name: true } },
  languageGroups: { select: { groupId: true, position: true }, orderBy: { position: "asc" } },
} as const;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const fullNameOf = (s: { lastName: string; firstName: string; middleName: string | null }) =>
  [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ");

const byStudentName = (a: StudentRow, b: StudentRow) =>
  byRu(a.lastName, b.lastName) || byRu(a.firstName, b.firstName) || byRu(a.middleName ?? "", b.middleName ?? "");

const toDeanStudent = (s: StudentRow): DeanStudent => ({
  recordBookNo: s.recordBookNo,
  fullName: fullNameOf(s),
  group: { id: s.academicGroup.id, name: s.academicGroup.name },
  course: s.course,
});

const groupsOf = (s: StudentRow) => [s.academicGroupId, ...s.languageGroups.map((g) => g.groupId)];

/** Срез, заполнение которого показываем: идущий, после срока 3-го — 3-й. */
const shownCheckpoint = (today: string): CheckpointNo => currentCheckpoint(today) ?? 3;

const groupKind = { ACADEMIC: "academic", LANGUAGE: "language", OTHER: "other" } as const;

type SemesterResult = Pick<MyGrades, "disciplines" | "overall" | "summary">;

const assignmentSelect = {
  id: true,
  groupId: true,
  disciplineId: true,
  finalKind: true,
  finalDate: true,
  teacher: { select: teacherSelect },
  group: { select: { id: true, name: true, kind: true } },
  discipline: { select: { name: true } },
} as const;

type AssignmentRow = Prisma.TeachingAssignmentGetPayload<{ select: typeof assignmentSelect }>;

/**
 * Оценки текущего семестра для набора студентов — пачкой, по тем же правилам, что getMyGrades
 * (buildSemesterGrades): дисциплины — всё, что есть в расписании групп студента; итоговый контроль и
 * семинаристы — из назначений этих групп; оценки — только за текущий семестр студента.
 * Запросов — четыре на весь набор, а не на каждого студента.
 */
async function loadSemesterResults(
  students: StudentRow[],
  today: string,
): Promise<{ results: Map<string, SemesterResult>; assignments: AssignmentRow[]; disciplinesByGroup: Map<string, Set<string>> }> {
  const groupIds = [...new Set(students.flatMap(groupsOf))];
  if (students.length === 0) {
    return { results: new Map(), assignments: [], disciplinesByGroup: new Map() };
  }
  const [pairs, assignments, grades] = await Promise.all([
    // Пары «группа × дисциплина» из расписания — одним запросом (DISTINCT в базе, а не тысячи занятий в памяти)
    db.$queryRaw<{ groupId: string; disciplineId: string }[]>`
      SELECT DISTINCT lg."groupId", l."disciplineId"
      FROM "LessonGroup" lg JOIN "Lesson" l ON l.id = lg."lessonId"
      WHERE lg."groupId" = ANY(${groupIds}::text[])`,
    db.teachingAssignment.findMany({
      where: { groupId: { in: groupIds } },
      select: assignmentSelect,
    }),
    db.grade.findMany({
      where: { studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true, disciplineId: true, semester: true, kind: true, checkpoint: true, points: true, passed: true },
    }),
  ]);
  const disciplines = await db.discipline.findMany({
    where: { id: { in: [...new Set(pairs.map((p) => p.disciplineId))] } },
    select: { id: true, name: true },
  });
  const disciplineById = new Map(disciplines.map((d) => [d.id, d]));
  const disciplinesByGroup = new Map<string, Set<string>>();
  for (const p of pairs) disciplinesByGroup.set(p.groupId, (disciplinesByGroup.get(p.groupId) ?? new Set()).add(p.disciplineId));
  const assignmentsByGroup = new Map<string, SemesterAssignmentRow[]>();
  for (const a of assignments) assignmentsByGroup.set(a.groupId, [...(assignmentsByGroup.get(a.groupId) ?? []), a]);
  const gradesByStudent = new Map<string, typeof grades>();
  for (const g of grades) gradesByStudent.set(g.studentId, [...(gradesByStudent.get(g.studentId) ?? []), g]);

  const results = new Map<string, SemesterResult>();
  for (const s of students) {
    const groups = groupsOf(s);
    const ids = new Set(groups.flatMap((g) => [...(disciplinesByGroup.get(g) ?? [])]));
    const semester = semesterForCourse(s.course);
    results.set(
      s.id,
      buildSemesterGrades(
        {
          disciplines: [...ids].map((id) => disciplineById.get(id)!).filter(Boolean),
          assignments: groups.flatMap((g) => assignmentsByGroup.get(g) ?? []),
          grades: (gradesByStudent.get(s.id) ?? []).filter((g) => g.semester === semester),
        },
        today,
      ),
    );
  }
  return { results, assignments, disciplinesByGroup };
}

const isPlausibleId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 64;

/** Номер зачётки из адреса: короткая строка без пробелов. */
export const isPlausibleRecordBook = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 32 && !/\s/.test(v);

/** Академическая группа своего факультета (условие для запросов). */
const facultyGroup = (ctx: StaffContext, groupId: string): Prisma.GroupWhereInput => ({
  id: groupId,
  kind: "ACADEMIC",
  facultyId: ctx.facultyId,
});

// ─── Курсы и обзор курса ────────────────────────────────────────────

/** Курсы факультета, на которых есть студенты (1 … N). */
export async function getFacultyCourses(ctx: StaffContext): Promise<number[]> {
  const rows = await db.student.groupBy({ by: ["course"], where: { facultyId: ctx.facultyId } });
  return rows.map((r) => r.course).sort((a, b) => a - b);
}

/**
 * Обзор курса своего факультета: сводка, группы, заполнение журналов, группа риска.
 * Неизвестный или не число курс → первый курс факультета. Факультета без студентов → null.
 */
export async function getCourseOverview(ctx: StaffContext, course?: number | string | null): Promise<CourseOverview | null> {
  const [faculty, courses] = await Promise.all([
    db.faculty.findUniqueOrThrow({ where: { id: ctx.facultyId }, select: { name: true } }),
    getFacultyCourses(ctx),
  ]);
  if (courses.length === 0) return null;
  const asked = typeof course === "string" ? Number(course) : course;
  const shown = typeof asked === "number" && courses.includes(asked) ? asked : courses[0]!;
  const today = moscowToday();
  const checkpoint = shownCheckpoint(today);

  const students = (
    await db.student.findMany({ where: { facultyId: ctx.facultyId, course: shown }, select: studentSelect })
  ).sort(byStudentName);
  const { results, assignments } = await loadSemesterResults(students, today);
  const resultOf = (s: StudentRow) => results.get(s.id)!;

  // Группы курса — академические группы студентов
  const groups = [...new Map(students.map((s) => [s.academicGroup.id, s.academicGroup])).values()]
    .sort((a, b) => byRu(a.name, b.name))
    .map((g) => ({
      ...g,
      summary: cohortSummary(students.filter((s) => s.academicGroupId === g.id).map(resultOf), checkpoint),
    }));

  // Журналы: по каждой паре — сколько студентов группы получили оценку за срез
  const journals: JournalFill[] = assignments
    .map((a) => {
      const members = students.filter((s) => groupsOf(s).includes(a.groupId));
      const graded = members.filter((s) =>
        resultOf(s).disciplines.some((d) => d.disciplineId === a.disciplineId && isCheckpointGraded(d, checkpoint)),
      ).length;
      return {
        assignmentId: a.id,
        discipline: a.discipline.name,
        group: { id: a.group.id, name: a.group.name, kind: groupKind[a.group.kind] },
        teacher: { shortName: a.teacher.shortName, fullName: a.teacher.fullName },
        graded,
        total: members.length,
      };
    })
    .filter((j) => j.total > 0)
    .sort(
      (a, b) =>
        a.graded / a.total - b.graded / b.total ||
        b.total - b.graded - (a.total - a.graded) ||
        byRu(a.discipline, b.discipline) ||
        byRu(a.group.name, b.group.name),
    );

  const risk: RiskStudent[] = students.flatMap((s) => {
    const debts = debtDisciplines(resultOf(s));
    return debts.length > 0 ? [{ ...toDeanStudent(s), overall: resultOf(s).overall, debts }] : [];
  });
  const riskDisciplines = [
    ...risk
      .flatMap((r) => r.debts)
      .reduce((m, d) => m.set(d.disciplineId, { id: d.disciplineId, name: d.discipline, count: (m.get(d.disciplineId)?.count ?? 0) + 1 }), new Map<string, { id: string; name: string; count: number }>())
      .values(),
  ].sort((a, b) => byRu(a.name, b.name));

  return {
    faculty: faculty.name,
    courses,
    course: shown,
    summary: cohortSummary(students.map(resultOf), checkpoint),
    groups,
    journals,
    risk,
    riskDisciplines,
    sampleRecordBook: students.map((s) => s.recordBookNo).sort()[0] ?? null,
  };
}

// ─── Группа ─────────────────────────────────────────────────────────

/**
 * Лёгкая проверка «академическая группа моего факультета» — для layout страницы группы:
 * layout выполняется до loading.tsx, поэтому чужой или мусорный id получает настоящий HTTP 404.
 */
export async function isFacultyGroup(ctx: StaffContext, groupId: string): Promise<boolean> {
  if (!isPlausibleId(groupId)) return false;
  return (await db.group.findFirst({ where: facultyGroup(ctx, groupId), select: { id: true } })) !== null;
}

/** Таблица группы «студенты × дисциплины». Чужая, языковая или несуществующая группа → null. */
export async function getFacultyGroupGrades(ctx: StaffContext, groupId: string): Promise<GroupGrades | null> {
  if (!isPlausibleId(groupId)) return null;
  const group = await db.group.findFirst({ where: facultyGroup(ctx, groupId), select: { id: true, name: true, course: true } });
  if (!group) return null;
  const today = moscowToday();
  const students = (
    await db.student.findMany({ where: { academicGroupId: group.id, facultyId: ctx.facultyId }, select: studentSelect })
  ).sort(byStudentName);
  const { results, disciplinesByGroup } = await loadSemesterResults(students, today);
  const all = students.map((s) => results.get(s.id)!);

  // Колонки — дисциплины академической группы; дисциплины языковых групп — колонки «1-й язык», «2-й язык»
  const own = disciplinesByGroup.get(group.id) ?? new Set<string>();
  const names = new Map(all.flatMap((r) => r.disciplines.map((d) => [d.disciplineId, d.discipline] as const)));
  const columns = [...own].filter((id) => names.has(id)).sort((a, b) => byRu(names.get(a)!, names.get(b)!));

  return {
    group,
    summary: cohortSummary(all, shownCheckpoint(today)),
    disciplines: columns.map((id) => ({ id, name: names.get(id)!, average: disciplineAverage(all, id) })),
    languageColumns: Math.max(0, ...students.map((s) => s.languageGroups.length)),
    students: students.map((s, i) => {
      const r = all[i]!;
      const byId = new Map(r.disciplines.map((d) => [d.disciplineId, d]));
      return {
        ...toDeanStudent(s),
        overall: r.overall,
        debts: debtDisciplines(r),
        cells: Object.fromEntries(columns.flatMap((id) => (byId.has(id) ? [[id, byId.get(id)!.average]] : []))),
        languages: s.languageGroups.map((lg) =>
          [...(disciplinesByGroup.get(lg.groupId) ?? [])]
            .filter((id) => !own.has(id) && byId.has(id))
            .map((id) => ({ disciplineId: id, discipline: byId.get(id)!.discipline, average: byId.get(id)!.average }))
            .sort((a, b) => byRu(a.discipline, b.discipline)),
        ),
      };
    }),
  };
}

// ─── Студент ────────────────────────────────────────────────────────

/** Лёгкая проверка «студент моего факультета» по номеру зачётки — для layout страницы студента. */
export async function isFacultyStudent(ctx: StaffContext, recordBookNo: string): Promise<boolean> {
  if (!isPlausibleRecordBook(recordBookNo)) return false;
  return (await db.student.findFirst({ where: { recordBookNo, facultyId: ctx.facultyId }, select: { id: true } })) !== null;
}

/**
 * Оценки студента своего факультета по номеру зачётки — тот же MyGrades, что видит сам студент
 * (loadStudentGrades → buildSemesterGrades). Чужой факультет или нет такой зачётки → null.
 */
export async function getFacultyStudentGrades(
  ctx: StaffContext,
  recordBookNo: string,
  semester?: number | string | null,
): Promise<DeanStudentGrades | null> {
  if (!isPlausibleRecordBook(recordBookNo)) return null;
  const s = await db.student.findFirst({
    where: { recordBookNo, facultyId: ctx.facultyId },
    select: { ...studentSelect, faculty: { select: { name: true } } },
  });
  if (!s) return null;
  return { student: { ...toDeanStudent(s), faculty: s.faculty.name }, grades: await loadStudentGrades(s.id, semester) };
}

// ─── Поиск ──────────────────────────────────────────────────────────

/** Зачётка без учёта регистра и без шаблонов: «%» и «_» — обычные символы (ILIKE с экранированием = точное равенство). */
const recordBookEquals = (v: string) => ({ recordBookNo: { equals: escapeLike(v), mode: "insensitive" as const } });

/** Студенты факультета для поиска «латиницей» — только имена и зачётки (факультет — сотни строк). */
const loadSearchIndex = (ctx: StaffContext) =>
  db.student.findMany({
    where: { facultyId: ctx.facultyId },
    select: { id: true, recordBookNo: true, lastName: true, firstName: true, middleName: true },
  });
type SearchIndexRow = Awaited<ReturnType<typeof loadSearchIndex>>[number];

/**
 * Поиск студента своего факультета: по номеру зачётки (полное совпадение — exact, без учёта регистра
 * и без шаблонов) и по ФИО (каждое слово — часть фамилии, имени, отчества или зачётки). До 3 слов,
 * запрос до 64 символов, от 2 символов, не больше 10 подсказок; % и _ — обычные символы, а не шаблон LIKE.
 *
 * Латиница: «25SL0001» и «25CЛ0001» находят 25СЛ0001 (транслит и буквы-двойники), «orlova» — Орлову (транслит,
 * как в логинах); если и так ничего — пробуем английскую раскладку («jhkjdf» → «орлова») и возвращаем layout —
 * исправленный запрос, чтобы экран подсказал «Похоже, включена английская раскладка».
 */
export async function searchFacultyStudents(
  ctx: StaffContext,
  query: string,
  limit: number = STUDENT_SEARCH_LIMIT,
): Promise<StudentSearchResult> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, STUDENT_SEARCH_MAX_LENGTH);
  if (q === "") return { exact: null, results: [] };
  const take = Math.min(Math.max(limit, 1), STUDENT_SEARCH_LIMIT);
  const latin = hasLatin(q);
  let index: Promise<SearchIndexRow[]> | null = null;
  const getIndex = () => (index ??= loadSearchIndex(ctx));

  // Точное совпадение зачётки: как есть, латинские двойники → кириллица, транслит («25SL0001»)
  let exact: string | null = null;
  if (isPlausibleRecordBook(q)) {
    const variants = [...new Set([q, latinLookalikesToCyrillic(q)])];
    const row = await db.student.findFirst({
      where: { facultyId: ctx.facultyId, OR: variants.map(recordBookEquals) },
      select: { recordBookNo: true },
    });
    exact = row?.recordBookNo ?? null;
    if (!exact && latin && isTranslitWord(q)) {
      const key = latinKey(q);
      exact = (await getIndex()).find((s) => latinKey(s.recordBookNo) === key)?.recordBookNo ?? null;
    }
  }
  if (q.length < STUDENT_SEARCH_MIN_LENGTH) return { exact, results: [] };

  const byWords = (text: string) =>
    db.student.findMany({
      where: {
        facultyId: ctx.facultyId,
        AND: text
          .split(" ")
          .slice(0, 3)
          .map((w) => {
            const contains = { contains: escapeLike(w), mode: "insensitive" as const };
            return { OR: [{ lastName: contains }, { firstName: contains }, { middleName: contains }, { recordBookNo: contains }] };
          }),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { recordBookNo: "asc" }],
      take,
      select: studentSelect,
    });

  const rows = await byWords(q);
  if (rows.length > 0 || !latin) return { exact, results: rows.map(toDeanStudent) };

  // Латиница не нашлась как есть: транслит («orlova», «25sl00») …
  const words = q.split(" ").slice(0, 3);
  if (words.every(isTranslitWord)) {
    const keys = words.map(latinKey);
    const looks = words.map(latinLookalikesToCyrillic);
    const ids = (await getIndex())
      .filter((s) => {
        const fields = [s.lastName, s.firstName, s.middleName ?? "", s.recordBookNo].map(latinKey);
        const book = s.recordBookNo.toUpperCase();
        return keys.every((k, i) => fields.some((f) => f.includes(k)) || book.includes(looks[i]!));
      })
      .map((s) => s.id);
    if (ids.length > 0) {
      const found = await db.student.findMany({
        where: { id: { in: ids }, facultyId: ctx.facultyId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { recordBookNo: "asc" }],
        take,
        select: studentSelect,
      });
      return { exact, results: found.map(toDeanStudent) };
    }
  }

  // … и английская раскладка («jhkjdf» → «орлова»)
  const layout = qwertyToCyrillic(q);
  if (layout && layout.trim().length >= STUDENT_SEARCH_MIN_LENGTH) {
    const fixed = await byWords(layout.trim().replace(/\s+/g, " "));
    if (fixed.length > 0) return { exact, results: fixed.map(toDeanStudent), layout: layout.trim() };
  }
  return { exact, results: [] };
}
