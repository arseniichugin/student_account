import "server-only";
import { takeActionLimit } from "@/lib/auth/action-limit";
import { db } from "@/lib/db";
import type { StudentContext, TeacherContext } from "@/lib/auth/guards";
import type { GradeKind, Prisma } from "@/lib/generated/prisma/client";
import { gradeNotification } from "@/lib/grades/notification";
import { formatCredit, letterFor, overallAverage, scored, scoredAverage, type GradeLetter, type ScoredGrade } from "@/lib/grades/scale";
import { isFailingLetter, overallFromCheckpoints } from "@/lib/grades/stats";
import {
  CHECKPOINTS,
  CHECKPOINT_NUMBERS,
  FINAL_KIND_LABEL,
  checkpointLabel,
  currentCheckpoint,
  semesterForCourse,
  semestersUpTo,
  termLabel,
  type CheckpointNo,
} from "@/lib/grades/term";
import { dbDateToIso, moscowToday } from "@/lib/moscow-time";
import { saveGradesSchema, type GradeEntryInput } from "@/lib/validation/grades";

export { getMyTeacherProfile } from "@/lib/data/profile";

// Слой данных успеваемости.
// ПРАВИЛА:
//  — студент читает только оценки ctx.studentId (из сессии), семестр — только свой;
//  — преподаватель видит студентов и оценки ТОЛЬКО по своим назначениям (TeachingAssignment.teacherId =
//    ctx.teacherId). Чужое или несуществующее назначение → null («Не найдено»), без подробностей;
//  — сохранение проверяет на сервере: назначение своё, студент в группе назначения, вид итоговой оценки
//    совпадает с итоговым контролем, значения проходят Zod. Иначе ничего не сохраняется;
//  — функции возвращают плоские сериализуемые объекты (даты «YYYY-MM-DD»).

// ─── Типы для экранов ───────────────────────────────────────────────

/** Оценка за срез или экзамен: баллы и буква; null — не выставлена. */
export type GradeCell = ScoredGrade | null;

/** Итоговый контроль пары «дисциплина × группа» из расписания. */
export type FinalControl = {
  kind: "EXAM" | "CREDIT";
  /** Дата экзамена/зачёта «YYYY-MM-DD» (по Москве) или null */
  date: string | null;
};

/** Итоговая оценка: экзамен — баллы и буква, зачёт — зачтено/не зачтено. */
export type FinalResult = { kind: "EXAM"; points: number; letter: GradeLetter } | { kind: "CREDIT"; passed: boolean };

export type SeminarTeacher = { id: string; shortName: string; fullName: string; rank: string | null; email: string | null };

export type MyDisciplineGrades = {
  disciplineId: string;
  discipline: string;
  /** 1-й, 2-й, 3-й срез по порядку */
  checkpoints: [GradeCell, GradeCell, GradeCell];
  /** Средний по выставленным срезам; null — «нет оценок» */
  average: ScoredGrade | null;
  /** null — в расписании нет ни экзамена, ни зачёта (или нет семинаров) */
  final: FinalControl | null;
  finalResult: FinalResult | null;
  /** Преподаватели семинаров (обычно один, бывает двое) */
  teachers: SeminarTeacher[];
};

export type MyGrades = {
  /** Показанный семестр */
  semester: number;
  /** Текущий семестр студента */
  currentSemester: number;
  /** Для переключателя: 1 … текущий */
  semesters: number[];
  isCurrent: boolean;
  /** «осенний семестр 2026/27» — только у текущего семестра */
  termLabel: string | null;
  /** Прошлые семестры — пустой список (оценок за них в кабинете нет) */
  disciplines: MyDisciplineGrades[];
  /** Итоговый балл: среднее из средних дисциплин, у которых есть хотя бы один срез */
  overall: ScoredGrade | null;
  summary: {
    /** Выставлено срезов из возможных (дисциплины × 3) */
    checkpointsGraded: number;
    checkpointsTotal: number;
    /** Неудовлетворительных оценок (FX/F за срезы и экзамен, «не зачтено») */
    failing: number;
    /** Идущий срез по сроку (1–3) или null после срока 3-го */
    currentCheckpoint: CheckpointNo | null;
    /** Ближайший экзамен или зачёт с сегодняшнего дня */
    nextFinal: { disciplineId: string; discipline: string; kind: "EXAM" | "CREDIT"; date: string } | null;
  };
};

export type AssignmentProgress = { checkpoint: CheckpointNo; graded: number; total: number };

/** Карточка журнала преподавателя: дисциплина × группа. */
export type TeacherAssignment = {
  id: string;
  discipline: { id: string; name: string };
  group: { id: string; name: string; kind: "academic" | "language" | "other"; course: number | null; faculty: string | null };
  studentCount: number;
  final: FinalControl | null;
  /** Другие преподаватели, которые тоже ставят оценки этой паре (краткие ФИО) */
  coTeachers: string[];
  /** Прогресс по срезам: «2-й срез: 12 из 20» */
  progress: AssignmentProgress[];
  /** Сколько итоговых оценок выставлено */
  finalGraded: number;
};

export type JournalStudent = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  /** «Фамилия Имя Отчество» */
  fullName: string;
  recordBookNo: string;
  /** Семестр студента, в который пишутся оценки */
  semester: number;
  checkpoints: [GradeCell, GradeCell, GradeCell];
  average: ScoredGrade | null;
  finalResult: FinalResult | null;
};

export type Journal = {
  assignment: TeacherAssignment;
  /** Все студенты группы по алфавиту */
  students: JournalStudent[];
  /** Сроки срезов для подписей */
  checkpoints: typeof CHECKPOINTS;
  currentCheckpoint: CheckpointNo | null;
};

export type SaveGradesResult =
  | {
      ok: true;
      /** Сколько оценок выставлено или исправлено (студенту — уведомление) */
      saved: number;
      /** Сколько оценок стёрто (без уведомления) */
      cleared: number;
      /** Обновлённые строки журнала — для тех студентов, кого касалось сохранение */
      students: JournalStudent[];
      assignment: TeacherAssignment;
    }
  | {
      ok: false;
      /** Общее сообщение («Журнал не найден», «Проверьте оценки», «Слишком много сохранений…») */
      error: string;
      /** Ошибки по полям: index — номер записи во входном entries */
      fieldErrors: { index: number; studentId: string | null; message: string }[];
      /** Что-то изменили, пока преподаватель работал: свежие строки журнала этих студентов */
      conflict?: { students: JournalStudent[]; assignment: TeacherAssignment };
      /** Лимит частоты: через сколько секунд можно сохранить снова */
      retryAfterSec?: number;
    };

// ─── Помощники ──────────────────────────────────────────────────────

type GradeRow = { kind: GradeKind; checkpoint: number; points: number | null; passed: boolean | null };

function checkpointsOf(rows: GradeRow[]): [GradeCell, GradeCell, GradeCell] {
  const cell = (no: number): GradeCell => {
    const g = rows.find((r) => r.kind === "CHECKPOINT" && r.checkpoint === no);
    return g?.points != null ? scored(g.points) : null;
  };
  return [cell(1), cell(2), cell(3)];
}

function finalResultOf(rows: GradeRow[], final: FinalControl | null): FinalResult | null {
  if (!final) return null;
  const g = rows.find((r) => r.kind === final.kind);
  if (!g) return null;
  if (final.kind === "EXAM") return g.points != null ? { kind: "EXAM", ...scored(g.points) } : null;
  return g.passed != null ? { kind: "CREDIT", passed: g.passed } : null;
}

function finalOf(a: { finalKind: "EXAM" | "CREDIT" | null; finalDate: Date | null }): FinalControl | null {
  return a.finalKind ? { kind: a.finalKind, date: a.finalDate ? dbDateToIso(a.finalDate) : null } : null;
}

const isFailing = (r: FinalResult | GradeCell): boolean =>
  !!r && ("passed" in r ? !r.passed : r.letter === "FX" || r.letter === "F");

const byRu = (a: string, b: string) => a.localeCompare(b, "ru");

/** Студенты группы: академическая — по Student.academicGroupId, языковая — по StudentGroup. */
const membersOf = (groupId: string): Prisma.StudentWhereInput => ({
  OR: [{ academicGroupId: groupId }, { languageGroups: { some: { groupId } } }],
});

const groupKind = { ACADEMIC: "academic", LANGUAGE: "language", OTHER: "other" } as const;

// ─── Студент ────────────────────────────────────────────────────────

/**
 * Оценки текущего студента за семестр (по умолчанию — текущий). Неверный или чужой номер семестра
 * (не 1…текущий) → текущий. Прошлые семестры — пустой список дисциплин: их оценок в кабинете нет.
 */
export async function getMyGrades(ctx: StudentContext, semester?: number | string | null): Promise<MyGrades> {
  const student = await db.student.findUniqueOrThrow({
    where: { id: ctx.studentId },
    select: { course: true, academicGroupId: true, languageGroups: { select: { groupId: true } } },
  });
  const currentSemester = semesterForCourse(student.course);
  const semesters = semestersUpTo(student.course);
  const asked = typeof semester === "string" ? Number(semester) : semester;
  const shown = typeof asked === "number" && semesters.includes(asked) ? asked : currentSemester;
  const today = moscowToday();

  const base = { semester: shown, currentSemester, semesters, isCurrent: shown === currentSemester };
  if (shown !== currentSemester) {
    return {
      ...base,
      termLabel: null,
      disciplines: [],
      overall: null,
      summary: { checkpointsGraded: 0, checkpointsTotal: 0, failing: 0, currentCheckpoint: null, nextFinal: null },
    };
  }

  const groupIds = [student.academicGroupId, ...student.languageGroups.map((g) => g.groupId)];
  const [disciplines, assignments, grades] = await Promise.all([
    // Дисциплины семестра — всё, что есть в расписании групп студента
    db.discipline.findMany({
      where: { lessons: { some: { groups: { some: { groupId: { in: groupIds } } } } } },
      select: { id: true, name: true },
    }),
    db.teachingAssignment.findMany({
      where: { groupId: { in: groupIds } },
      select: {
        disciplineId: true,
        finalKind: true,
        finalDate: true,
        teacher: { select: { id: true, shortName: true, fullName: true, rank: true, email: true } },
      },
    }),
    db.grade.findMany({
      where: { studentId: ctx.studentId, semester: shown },
      select: { disciplineId: true, kind: true, checkpoint: true, points: true, passed: true },
    }),
  ]);

  const list: MyDisciplineGrades[] = disciplines
    .sort((a, b) => byRu(a.name, b.name))
    .map((d) => {
      const mine = assignments.filter((a) => a.disciplineId === d.id);
      const rows = grades.filter((g) => g.disciplineId === d.id);
      const checkpoints = checkpointsOf(rows);
      const final = mine.map(finalOf).find(Boolean) ?? null;
      const teachers = [...new Map(mine.map((a) => [a.teacher.id, a.teacher])).values()].sort((a, b) => byRu(a.shortName, b.shortName));
      return {
        disciplineId: d.id,
        discipline: d.name,
        checkpoints,
        average: scoredAverage(checkpoints.map((c) => c?.points)),
        final,
        finalResult: finalResultOf(rows, final),
        teachers,
      };
    });

  const overallPoints = overallAverage(list.map((d) => d.average?.points));
  const next = list
    .filter((d) => d.final?.date && d.final.date >= today)
    .sort((a, b) => a.final!.date!.localeCompare(b.final!.date!))[0];
  return {
    ...base,
    termLabel: termLabel(),
    disciplines: list,
    overall: overallPoints === null ? null : scored(overallPoints),
    summary: {
      checkpointsGraded: list.reduce((n, d) => n + d.checkpoints.filter(Boolean).length, 0),
      checkpointsTotal: list.length * CHECKPOINT_NUMBERS.length,
      failing: list.reduce((n, d) => n + d.checkpoints.filter(isFailing).length + (isFailing(d.finalResult) ? 1 : 0), 0),
      currentCheckpoint: currentCheckpoint(today),
      nextFinal: next ? { disciplineId: next.disciplineId, discipline: next.discipline, kind: next.final!.kind, date: next.final!.date! } : null,
    },
  };
}

/** Последняя выставленная оценка — для блока «Оценки» на «Сегодня». */
export type LatestGrade = {
  disciplineId: string;
  discipline: string;
  /** «2-й срез», «Экзамен», «Зачёт» */
  label: string;
  /** Срез и экзамен — баллы с буквой; зачёт — null */
  grade: ScoredGrade | null;
  /** Зачёт — зачтено/не зачтено; иначе null */
  passed: boolean | null;
};

export type MyGradesDigest = {
  /** Итоговый балл текущего семестра («среднее из средних») или null — оценок нет */
  overall: ScoredGrade | null;
  /** Дисциплин, где есть FX/F или «не зачтено» */
  failingDisciplines: number;
  /** Последние выставленные оценки, новые сверху */
  latest: LatestGrade[];
};

/**
 * Кратко об оценках текущего семестра для «Сегодня»: итоговый балл и последние оценки.
 * Только чтение и только оценки ctx.studentId. Итоговый балл — по тому же правилу, что и getMyGrades.
 */
export async function getMyGradesDigest(ctx: StudentContext, limit = 2): Promise<MyGradesDigest> {
  const student = await db.student.findUniqueOrThrow({ where: { id: ctx.studentId }, select: { course: true } });
  const rows = await db.grade.findMany({
    where: { studentId: ctx.studentId, semester: semesterForCourse(student.course) },
    select: {
      disciplineId: true,
      kind: true,
      checkpoint: true,
      points: true,
      passed: true,
      discipline: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { checkpoint: "desc" }],
  });
  const checkpoints = rows.flatMap((r) =>
    r.kind === "CHECKPOINT" && r.points != null ? [{ disciplineId: r.disciplineId, points: r.points }] : [],
  );
  const failing = new Set(
    rows
      .filter((r) => (r.kind === "CREDIT" ? r.passed === false : r.points != null && isFailingLetter(letterFor(r.points))))
      .map((r) => r.disciplineId),
  );
  return {
    overall: overallFromCheckpoints(checkpoints),
    failingDisciplines: failing.size,
    latest: rows.slice(0, Math.max(0, limit)).map((r) => ({
      disciplineId: r.disciplineId,
      discipline: r.discipline.name,
      label: r.kind === "CHECKPOINT" ? checkpointLabel(r.checkpoint) : FINAL_KIND_LABEL[r.kind],
      grade: r.kind !== "CREDIT" && r.points != null ? scored(r.points) : null,
      passed: r.kind === "CREDIT" ? r.passed : null,
    })),
  };
}

// ─── Преподаватель ──────────────────────────────────────────────────

const assignmentSelect = {
  id: true,
  finalKind: true,
  finalDate: true,
  discipline: { select: { id: true, name: true } },
  group: { select: { id: true, name: true, kind: true, course: true, faculty: { select: { name: true } } } },
} as const;

type AssignmentRow = Prisma.TeachingAssignmentGetPayload<{ select: typeof assignmentSelect }>;

type MemberRow = {
  id: string;
  userId: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  recordBookNo: string;
  course: number;
};

const memberSelect = {
  id: true,
  userId: true,
  lastName: true,
  firstName: true,
  middleName: true,
  recordBookNo: true,
  course: true,
} as const;

/** Студенты пар и их оценки по дисциплинам пар — пачкой, без запроса на каждую карточку. */
async function loadAssignmentData(ctx: TeacherContext, rows: AssignmentRow[]) {
  const groupIds = [...new Set(rows.map((a) => a.group.id))];
  const disciplineIds = [...new Set(rows.map((a) => a.discipline.id))];
  const [members, coTeachers] = await Promise.all([
    db.student.findMany({
      where: { OR: [{ academicGroupId: { in: groupIds } }, { languageGroups: { some: { groupId: { in: groupIds } } } }] },
      select: { ...memberSelect, academicGroupId: true, languageGroups: { select: { groupId: true } } },
    }),
    db.teachingAssignment.findMany({
      where: { groupId: { in: groupIds }, disciplineId: { in: disciplineIds }, teacherId: { not: ctx.teacherId } },
      select: { groupId: true, disciplineId: true, teacher: { select: { shortName: true } } },
    }),
  ]);
  const grades = await db.grade.findMany({
    where: { disciplineId: { in: disciplineIds }, studentId: { in: members.map((m) => m.id) } },
    select: { studentId: true, disciplineId: true, semester: true, kind: true, checkpoint: true, points: true, passed: true },
  });
  const studentsOf = (groupId: string): MemberRow[] =>
    members.filter((m) => m.academicGroupId === groupId || m.languageGroups.some((g) => g.groupId === groupId));
  const gradesBy = new Map<string, typeof grades>();
  for (const g of grades) {
    const k = `${g.studentId}:${g.disciplineId}`;
    gradesBy.set(k, [...(gradesBy.get(k) ?? []), g]);
  }
  // Только оценки текущего семестра студента
  const gradesOf = (student: MemberRow, disciplineId: string) =>
    (gradesBy.get(`${student.id}:${disciplineId}`) ?? []).filter((g) => g.semester === semesterForCourse(student.course));
  const coTeachersOf = (a: AssignmentRow) =>
    coTeachers
      .filter((c) => c.groupId === a.group.id && c.disciplineId === a.discipline.id)
      .map((c) => c.teacher.shortName)
      .sort(byRu);
  return { studentsOf, gradesOf, coTeachersOf };
}

function toAssignment(
  a: AssignmentRow,
  students: MemberRow[],
  gradesOf: (s: MemberRow, disciplineId: string) => GradeRow[],
  coTeachers: string[],
): TeacherAssignment {
  const final = finalOf(a);
  const perStudent = students.map((s) => gradesOf(s, a.discipline.id));
  return {
    id: a.id,
    discipline: a.discipline,
    group: {
      id: a.group.id,
      name: a.group.name,
      kind: groupKind[a.group.kind],
      course: a.group.course,
      faculty: a.group.faculty?.name ?? null,
    },
    studentCount: students.length,
    final,
    coTeachers,
    progress: CHECKPOINT_NUMBERS.map((no) => ({
      checkpoint: no,
      graded: perStudent.filter((rows) => rows.some((r) => r.kind === "CHECKPOINT" && r.checkpoint === no)).length,
      total: students.length,
    })),
    finalGraded: perStudent.filter((rows) => finalResultOf(rows, final) !== null).length,
  };
}

function toJournalStudent(s: MemberRow, rows: GradeRow[], final: FinalControl | null): JournalStudent {
  const checkpoints = checkpointsOf(rows);
  return {
    id: s.id,
    lastName: s.lastName,
    firstName: s.firstName,
    middleName: s.middleName,
    fullName: [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" "),
    recordBookNo: s.recordBookNo,
    semester: semesterForCourse(s.course),
    checkpoints,
    average: scoredAverage(checkpoints.map((c) => c?.points)),
    finalResult: finalResultOf(rows, final),
  };
}

const byName = (a: MemberRow, b: MemberRow) =>
  byRu(a.lastName, b.lastName) || byRu(a.firstName, b.firstName) || byRu(a.middleName ?? "", b.middleName ?? "");

/** Карточки журнала: все пары «дисциплина × группа» преподавателя с прогрессом по срезам. */
export async function getMyAssignments(ctx: TeacherContext): Promise<TeacherAssignment[]> {
  const rows = await db.teachingAssignment.findMany({ where: { teacherId: ctx.teacherId }, select: assignmentSelect });
  if (rows.length === 0) return [];
  const { studentsOf, gradesOf, coTeachersOf } = await loadAssignmentData(ctx, rows);
  return rows
    .map((a) => toAssignment(a, studentsOf(a.group.id), gradesOf, coTeachersOf(a)))
    .sort((a, b) => byRu(a.discipline.name, b.discipline.name) || byRu(a.group.name, b.group.name));
}

const isPlausibleId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 64;

/** Своё назначение по id — или null (чужое, несуществующее, мусор в адресе). */
function findMyAssignment(ctx: TeacherContext, assignmentId: string) {
  if (!isPlausibleId(assignmentId)) return null;
  return db.teachingAssignment.findFirst({ where: { id: assignmentId, teacherId: ctx.teacherId }, select: assignmentSelect });
}

/**
 * Лёгкая проверка «это назначение моё» — для layout страницы журнала: layout выполняется до границы
 * загрузки (loading.tsx), поэтому чужой или мусорный id получает настоящий HTTP 404, а не 200 со «скелетоном».
 * Страница всё равно проверяет сама (getJournal) — двойной рубеж.
 */
export async function isMyAssignment(ctx: TeacherContext, assignmentId: string): Promise<boolean> {
  if (!isPlausibleId(assignmentId)) return false;
  const a = await db.teachingAssignment.findFirst({ where: { id: assignmentId, teacherId: ctx.teacherId }, select: { id: true } });
  return a !== null;
}

/**
 * Журнал группы: все студенты (по алфавиту) и их оценки по дисциплине назначения.
 * Чужое или несуществующее назначение → null (страница отвечает 404).
 */
export async function getJournal(ctx: TeacherContext, assignmentId: string): Promise<Journal | null> {
  const a = await findMyAssignment(ctx, assignmentId);
  if (!a) return null;
  const { studentsOf, gradesOf, coTeachersOf } = await loadAssignmentData(ctx, [a]);
  const students = studentsOf(a.group.id).sort(byName);
  const assignment = toAssignment(a, students, gradesOf, coTeachersOf(a));
  return {
    assignment,
    students: students.map((s) => toJournalStudent(s, gradesOf(s, a.discipline.id), assignment.final)),
    checkpoints: CHECKPOINTS,
    currentCheckpoint: currentCheckpoint(moscowToday()),
  };
}

const NOT_FOUND: SaveGradesResult = { ok: false, error: "Журнал не найден", fieldErrors: [] };

/**
 * Лимит частоты сохранений на преподавателя: не больше 60 сохранений и 1000 оценок за 10 минут.
 * Обычная работа (вся группа до ~30 человек × 4 колонки = 1–2 сохранения) далеко от порога,
 * а скрипт или «залипшая» кнопка не завалят базу оценками и уведомлениями (общий демо-аккаунт).
 */
export const SAVE_LIMIT = { calls: 60, grades: 1000, windowMs: 10 * 60_000 } as const;

function rateLimited(retryAfterMs: number): SaveGradesResult {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return {
    ok: false,
    error: `Слишком много сохранений подряд. Подождите ${minutes} мин и сохраните снова — введённые оценки останутся в полях`,
    fieldErrors: [],
    retryAfterSec: Math.ceil(retryAfterMs / 1000),
  };
}

const entryKey = (e: GradeEntryInput) => `${e.studentId}:${e.kind}:${e.kind === "CHECKPOINT" ? e.checkpoint : 0}`;
const rowKey = (g: { studentId: string; semester: number; kind: GradeKind; checkpoint: number }) =>
  `${g.studentId}:${g.semester}:${g.kind}:${g.checkpoint}`;

/** Значение оценки для сравнения: баллы (срез, экзамен) или зачтено/не зачтено; null — нет оценки. */
type GradeValue = number | boolean | null;
const shownValue = (v: number | boolean) => (typeof v === "boolean" ? formatCredit(v) : String(v));

function conflictMessage(expected: GradeValue, actual: GradeValue): string {
  if (actual === null) return "Оценку уже стёрли";
  if (expected === null) return `Оценку уже поставили: ${shownValue(actual)}`;
  return `Оценку уже изменили: ${shownValue(actual)}`;
}

type FieldError = { index: number; studentId: string | null; message: string };

/**
 * Сохраняет одну или несколько оценок журнала (строкой или колонкой). Ввод — недоверенный (из браузера):
 * проверяется Zod, затем на сервере — назначение принадлежит ctx.teacherId, каждый студент состоит в группе
 * назначения, экзамен/зачёт совпадает с итоговым контролем. Любая ошибка — не сохраняется ничего.
 *
 * Оптимистичная блокировка: если в записи указано `expected` (что видел преподаватель), а в базе уже другое
 * (вторая вкладка, второй семинарист группы), — отказ с ошибкой у поля и свежими строками журнала, без
 * тихой перезаписи. Сохранения по одной дисциплине идут по очереди (advisory-блокировка до конца транзакции),
 * поэтому параллельные запросы не проскакивают мимо проверки и не плодят уведомления.
 *
 * Новая или исправленная оценка → уведомление GRADE студенту («Новая оценка: …», ссылка на /grades);
 * стёртая — без уведомления. Лимит частоты — SAVE_LIMIT. Демо-режим не мешает: ставить оценки — главный
 * сценарий для жюри.
 */
export async function saveGrades(ctx: TeacherContext, input: unknown): Promise<SaveGradesResult> {
  const calls = takeActionLimit(`grades-save:${ctx.teacherId}`, SAVE_LIMIT.calls, SAVE_LIMIT.windowMs);
  if (!calls.ok) return rateLimited(calls.retryAfterMs);

  const parsed = saveGradesSchema.safeParse(input);
  if (!parsed.success) {
    const raw = (input as { entries?: unknown } | null)?.entries;
    const fieldErrors = parsed.error.issues
      .filter((i) => i.path[0] === "entries" && typeof i.path[1] === "number")
      .map((i) => {
        const index = i.path[1] as number;
        const sid = Array.isArray(raw) ? (raw[index] as { studentId?: unknown } | null | undefined)?.studentId : null;
        return { index, studentId: typeof sid === "string" ? sid.slice(0, 64) : null, message: i.message };
      });
    const general = parsed.error.issues.find((i) => !(i.path[0] === "entries" && typeof i.path[1] === "number"));
    if (general?.path[0] === "assignmentId") return NOT_FOUND;
    return { ok: false, error: general?.message ?? "Проверьте оценки", fieldErrors };
  }
  const { assignmentId, entries } = parsed.data;

  const volume = takeActionLimit(`grades-save-entries:${ctx.teacherId}`, SAVE_LIMIT.grades, SAVE_LIMIT.windowMs, entries.length);
  if (!volume.ok) return rateLimited(volume.retryAfterMs);

  const a = await findMyAssignment(ctx, assignmentId);
  if (!a) return NOT_FOUND;

  const ids = [...new Set(entries.map((e) => e.studentId))];
  const members = await db.student.findMany({
    where: { AND: [{ id: { in: ids } }, membersOf(a.group.id)] },
    select: memberSelect,
  });
  const memberById = new Map(members.map((m) => [m.id, m]));

  const finalName = { EXAM: "экзамен", CREDIT: "зачёт" } as const;
  const fieldErrors: FieldError[] = [];
  const seen = new Set<string>();
  entries.forEach((e, index) => {
    const err = (message: string) => fieldErrors.push({ index, studentId: e.studentId, message });
    if (!memberById.has(e.studentId)) return err("Этого студента нет в группе журнала");
    if (seen.has(entryKey(e))) return err("Эта оценка указана дважды");
    seen.add(entryKey(e));
    if (e.kind !== "CHECKPOINT" && e.kind !== a.finalKind) {
      return err(
        a.finalKind
          ? `Итоговый контроль по дисциплине — ${finalName[a.finalKind]}, а не ${finalName[e.kind]}`
          : "В расписании у дисциплины нет ни экзамена, ни зачёта",
      );
    }
  });
  if (fieldErrors.length > 0) return { ok: false, error: "Проверьте оценки", fieldErrors };

  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: ctx.teacherId }, select: { shortName: true } });
  const keyOf = (e: GradeEntryInput) => {
    const s = memberById.get(e.studentId)!;
    return {
      studentId: s.id,
      disciplineId: a.discipline.id,
      semester: semesterForCourse(s.course),
      kind: e.kind,
      checkpoint: e.kind === "CHECKPOINT" ? e.checkpoint : 0,
    };
  };
  const semesters = [...new Set(members.map((m) => semesterForCourse(m.course)))];

  // Всё сохранение — 4–6 запросов при любом числе оценок: прочитать имеющиеся оценки одним запросом,
  // сравнить в памяти, затем удалить / создать / исправить пачками и создать уведомления одним запросом.
  const outcome = await db.$transaction(
    async (tx) => {
      // Сохранения по одной дисциплине — по очереди: блокировка держится до конца транзакции
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`grades:${a.discipline.id}`}::text, 0))`;
      const existing = await tx.grade.findMany({
        where: { disciplineId: a.discipline.id, studentId: { in: members.map((m) => m.id) }, semester: { in: semesters } },
        select: { id: true, studentId: true, semester: true, kind: true, checkpoint: true, points: true, passed: true },
      });
      const byKey = new Map(existing.map((g) => [rowKey(g), g]));

      const conflicts: FieldError[] = [];
      const toDelete: string[] = [];
      const toCreate: Prisma.GradeCreateManyInput[] = [];
      const toUpdate = new Map<string, { value: { points: number | null; passed: boolean | null }; ids: string[] }>();
      const notifications: Prisma.NotificationCreateManyInput[] = [];
      let saved = 0;
      let cleared = 0;

      entries.forEach((e, index) => {
        const key = keyOf(e);
        const old = byKey.get(rowKey(key));
        const oldValue: GradeValue = e.kind === "CREDIT" ? (old?.passed ?? null) : (old?.points ?? null);
        const newValue: GradeValue = e.kind === "CREDIT" ? e.passed : e.points;
        if (newValue === oldValue) return; // уже так — ничего не меняем и не уведомляем
        if (e.expected !== undefined && e.expected !== oldValue) {
          conflicts.push({ index, studentId: e.studentId, message: conflictMessage(e.expected, oldValue) });
          return;
        }
        if (newValue === null) {
          toDelete.push(old!.id);
          cleared++;
          return;
        }
        const value = e.kind === "CREDIT" ? { points: null, passed: e.passed } : { points: e.points, passed: null };
        if (old) {
          const k = JSON.stringify(value);
          const group = toUpdate.get(k) ?? { value, ids: [] };
          group.ids.push(old.id);
          toUpdate.set(k, group);
        } else {
          toCreate.push({ ...key, ...value, gradedByTeacherId: ctx.teacherId });
        }
        saved++;
        const n = gradeNotification(
          e.kind === "CHECKPOINT"
            ? { discipline: a.discipline.name, kind: "CHECKPOINT", checkpoint: e.checkpoint, points: e.points!, teacher: teacher.shortName }
            : e.kind === "EXAM"
              ? { discipline: a.discipline.name, kind: "EXAM", points: e.points!, teacher: teacher.shortName }
              : { discipline: a.discipline.name, kind: "CREDIT", passed: e.passed!, teacher: teacher.shortName },
        );
        notifications.push({ userId: memberById.get(e.studentId)!.userId, type: "GRADE", ...n });
      });
      if (conflicts.length > 0) return { ok: false as const, conflicts };

      if (toDelete.length > 0) await tx.grade.deleteMany({ where: { id: { in: toDelete } } });
      if (toCreate.length > 0) await tx.grade.createMany({ data: toCreate });
      // Исправления — по одному запросу на каждое новое значение, а не на каждую оценку
      for (const { value, ids: gradeIds } of toUpdate.values()) {
        await tx.grade.updateMany({ where: { id: { in: gradeIds } }, data: { ...value, gradedByTeacherId: ctx.teacherId } });
      }
      if (notifications.length > 0) await tx.notification.createMany({ data: notifications });
      return { ok: true as const, saved, cleared };
    },
    // Явные сроки: ожидание соединения и сама транзакция (по умолчанию — 2 с и 5 с)
    { maxWait: 5_000, timeout: 15_000 },
  );

  // Свежие строки журнала: после сохранения — затронутых студентов, при конфликте — студентов с конфликтом
  // (журнал покажет, что уже стоит в базе)
  const { studentsOf, gradesOf, coTeachersOf } = await loadAssignmentData(ctx, [a]);
  const all = studentsOf(a.group.id);
  const assignment = toAssignment(a, all, gradesOf, coTeachersOf(a));
  const rowsFor = (studentIds: Set<string>) =>
    all
      .filter((m) => studentIds.has(m.id))
      .sort(byName)
      .map((s) => toJournalStudent(s, gradesOf(s, a.discipline.id), assignment.final));

  if (!outcome.ok) {
    const n = outcome.conflicts.length;
    return {
      ok: false,
      error: n === 1 ? "Эту оценку уже изменили, пока вы работали" : "Эти оценки уже изменили, пока вы работали",
      fieldErrors: outcome.conflicts,
      conflict: { students: rowsFor(new Set(outcome.conflicts.map((c) => c.studentId!))), assignment },
    };
  }
  return { ok: true, saved: outcome.saved, cleared: outcome.cleared, students: rowsFor(new Set(memberById.keys())), assignment };
}
