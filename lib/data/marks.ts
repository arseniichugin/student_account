import "server-only";
import { db } from "@/lib/db";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";
import {
  average,
  matchesDateQuery,
  numericGrade,
  semesterRange,
  studentSemesterNo,
  type MarkValue,
} from "@/lib/marks/stats";
import { addDaysIso, dbDateToIso, isoDateToDb, moscowNowTime, moscowToday } from "@/lib/moscow-time";
import { MAX_MARKS_PER_LESSON, MARK_SUGGEST_LIMIT, type CreateMarkInput, type MarkSuggestItem } from "@/lib/validation/marks";

// Слой данных успеваемости: оценки на занятиях (Mark) и итоговые оценки ведомостей (Grade).
// ПРАВИЛА:
//   студент   → только where.studentId = ctx.studentId (из сессии, не из параметров);
//   сотрудник → только студенты своего факультета: where.facultyId = ctx.facultyId;
//               занятие должно быть в группах ЭТОГО студента и уже состояться (не в будущем, не отменено).
// Чужой студент / чужое занятие → тот же ответ, что и несуществующие (null / пустой список).

// ─── Студент: оценки и инфографика ──────────────────────────────────

export type MarkItem = {
  id: string;
  /** «2026-11-12» */
  date: string;
  /** «10:30» */
  start: string;
  discipline: string;
  /** «Семинар», «Лекция»… */
  kind: string;
  value: MarkValue;
};

export type SemesterBar = { no: number; average: number | null; count: number; current: boolean };

export type DisciplineMarks = { name: string; average: number | null; marks: MarkItem[] };

export type MarksOverview = {
  today: string;
  semesterNo: number;
  semesterFrom: string;
  semesterTo: string;
  /** Все числовые оценки: на занятиях + экзамены, курсовые и контрольные точки из ведомостей */
  allTime: { average: number | null; count: number };
  /** То же — только за текущий семестр */
  semester: { average: number | null; count: number };
  /** Оценки на занятиях за последние 7 дней (сегодня включительно), новые сверху */
  lastWeek: { from: string; to: string; average: number | null; marks: MarkItem[] };
  /** Средний балл по семестрам — для графика */
  bySemester: SemesterBar[];
  /** Сколько каких оценок на занятиях в текущем семестре */
  distribution: { value: MarkValue; count: number }[];
  /** Оценки на занятиях текущего семестра по предметам (по алфавиту) */
  byDiscipline: DisciplineMarks[];
};

export async function getMyMarksOverview(ctx: StudentContext, today: string = moscowToday()): Promise<MarksOverview> {
  const [student, marks, grades] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: ctx.studentId }, select: { course: true } }),
    db.mark.findMany({
      where: { studentId: ctx.studentId, date: { lte: isoDateToDb(today) } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        startTime: true,
        lessonKind: true,
        value: true,
        discipline: { select: { name: true } },
      },
    }),
    db.grade.findMany({ where: { studentId: ctx.studentId }, select: { semester: true, value: true } }),
  ]);

  const semesterNo = studentSemesterNo(student.course, today, today);
  const { from: semesterFrom, to: semesterTo } = semesterRange(today);
  const weekFrom = addDaysIso(today, -6);

  const items: MarkItem[] = marks.map((m) => ({
    id: m.id,
    date: dbDateToIso(m.date),
    start: m.startTime,
    discipline: m.discipline.name,
    kind: m.lessonKind,
    value: m.value as MarkValue,
  }));

  // Все числовые оценки с номером семестра
  const numeric: { semester: number; value: number }[] = [
    ...items.map((m) => ({ semester: studentSemesterNo(student.course, today, m.date), value: m.value })),
    ...grades.flatMap((g) => {
      const value = numericGrade(g.value);
      return value == null ? [] : [{ semester: g.semester, value }];
    }),
  ];

  const bySemester: SemesterBar[] = [];
  for (let no = 1; no <= semesterNo; no++) {
    const values = numeric.filter((n) => n.semester === no).map((n) => n.value);
    bySemester.push({ no, average: average(values), count: values.length, current: no === semesterNo });
  }
  const semesterValues = numeric.filter((n) => n.semester === semesterNo).map((n) => n.value);

  const semesterMarks = items.filter((m) => m.date >= semesterFrom && m.date <= semesterTo);
  const lastWeek = items.filter((m) => m.date >= weekFrom);

  const byName = new Map<string, MarkItem[]>();
  for (const m of semesterMarks) byName.set(m.discipline, [...(byName.get(m.discipline) ?? []), m]);
  const byDiscipline = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([name, list]) => ({
      name,
      average: average(list.map((m) => m.value)),
      // по предмету — в хронологическом порядке
      marks: [...list].reverse(),
    }));

  return {
    today,
    semesterNo,
    semesterFrom,
    semesterTo,
    allTime: { average: average(numeric.map((n) => n.value)), count: numeric.length },
    semester: { average: average(semesterValues), count: semesterValues.length },
    lastWeek: { from: weekFrom, to: today, average: average(lastWeek.map((m) => m.value)), marks: lastWeek },
    bySemester,
    distribution: ([5, 4, 3, 2, 1] as const).map((value) => ({
      value,
      count: semesterMarks.filter((m) => m.value === value).length,
    })),
    byDiscipline,
  };
}

// ─── Сотрудник деканата: ввод оценок ────────────────────────────────

/** Студент своего факультета и его группы; чужой или несуществующий — null. */
async function facultyStudent(ctx: StaffContext, studentId: string) {
  const s = await db.student.findFirst({
    where: { id: studentId, facultyId: ctx.facultyId },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      academicGroupId: true,
      languageGroups: { select: { groupId: true } },
    },
  });
  if (!s) return null;
  return { ...s, groupIds: [s.academicGroupId, ...s.languageGroups.map((g) => g.groupId)] };
}

/**
 * Занятия, на которых можно ставить оценку: в группах студента, не отменены и уже начались —
 * в прошлые дни или сегодня не позже текущего времени по Москве («HH:MM» сравнивается как строка).
 */
function gradableLessonsWhere(groupIds: string[], today: string, nowTime: string = moscowNowTime()) {
  return {
    status: { not: "CANCELLED" as const },
    groups: { some: { groupId: { in: groupIds } } },
    OR: [{ date: { lt: isoDateToDb(today) } }, { date: isoDateToDb(today), startTime: { lte: nowTime } }],
  };
}

const fio = (s: { lastName: string; firstName: string; middleName: string | null }) =>
  [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ");

const ruDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Подсказки «Студент»: фамилия, имя, отчество, группа или логин — только свой факультет. */
export async function suggestFacultyStudents(ctx: StaffContext, q: string): Promise<MarkSuggestItem[]> {
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4);
  if (tokens.length === 0) return [];
  const rows = await db.student.findMany({
    where: {
      facultyId: ctx.facultyId,
      AND: tokens.map((t) => ({
        OR: [
          { lastName: { startsWith: t, mode: "insensitive" as const } },
          { firstName: { startsWith: t, mode: "insensitive" as const } },
          { middleName: { startsWith: t, mode: "insensitive" as const } },
          { academicGroup: { name: { startsWith: t, mode: "insensitive" as const } } },
          { user: { login: { startsWith: t, mode: "insensitive" as const } } },
        ],
      })),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: MARK_SUGGEST_LIMIT,
    select: { id: true, lastName: true, firstName: true, middleName: true, course: true, academicGroup: { select: { name: true } } },
  });
  return rows.map((s) => ({ id: s.id, label: fio(s), meta: `${s.academicGroup.name} · ${s.course} курс` }));
}

/** Подсказки «Предмет»: дисциплины, по которым у студента уже были занятия. */
export async function suggestStudentDisciplines(
  ctx: StaffContext,
  studentId: string,
  q: string,
  today: string = moscowToday(),
): Promise<MarkSuggestItem[]> {
  const student = await facultyStudent(ctx, studentId);
  if (!student) return [];
  const rows = await db.discipline.findMany({
    where: {
      name: q ? { contains: q, mode: "insensitive" } : undefined,
      lessons: { some: gradableLessonsWhere(student.groupIds, today) },
    },
    orderBy: { name: "asc" },
    take: MARK_SUGGEST_LIMIT,
    select: { id: true, name: true, _count: { select: { marks: { where: { studentId } } } } },
  });
  return rows.map((d) => ({
    id: d.id,
    label: d.name,
    meta: d._count.marks ? `Оценок у студента: ${d._count.marks}` : "Оценок пока нет",
  }));
}

/**
 * Подсказки «Дата»: прошедшие занятия студента по предмету, сначала последние.
 * Каждая подсказка — конкретное занятие (если в один день две пары — будут две подсказки с разным временем).
 */
export async function suggestStudentLessons(
  ctx: StaffContext,
  studentId: string,
  disciplineId: string,
  q: string,
  today: string = moscowToday(),
): Promise<MarkSuggestItem[]> {
  const student = await facultyStudent(ctx, studentId);
  if (!student) return [];
  const rows = await db.lesson.findMany({
    where: { disciplineId, ...gradableLessonsWhere(student.groupIds, today) },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    take: 300,
    select: {
      id: true,
      date: true,
      startTime: true,
      kind: true,
      marks: { where: { studentId }, orderBy: { createdAt: "asc" }, select: { value: true } },
    },
  });
  return rows
    .filter((l) => matchesDateQuery(dbDateToIso(l.date), q))
    .slice(0, MARK_SUGGEST_LIMIT)
    .map((l) => ({
      id: l.id,
      label: `${ruDate(dbDateToIso(l.date))}, ${l.startTime}`,
      meta: [l.kind, l.marks.length ? `уже: ${l.marks.map((m) => m.value).join(", ")}` : null].filter(Boolean).join(" · "),
    }));
}

export type CreateMarkResult =
  | { ok: true; student: string; discipline: string; date: string; start: string; value: number }
  | { ok: false; error: string };

/** Выставить оценку студенту своего факультета за прошедшее занятие его группы. */
export async function createFacultyMark(
  ctx: StaffContext,
  input: CreateMarkInput,
  today: string = moscowToday(),
): Promise<CreateMarkResult> {
  const student = await facultyStudent(ctx, input.studentId);
  if (!student) return { ok: false, error: "Студент не найден на вашем факультете" };

  const lesson = await db.lesson.findFirst({
    where: { id: input.lessonId, ...gradableLessonsWhere(student.groupIds, today) },
    select: { id: true, oid: true, date: true, startTime: true, kind: true, disciplineId: true, discipline: { select: { name: true } } },
  });
  if (!lesson) {
    return { ok: false, error: "У студента не было такого занятия (или оно ещё не началось) — выберите дату из списка" };
  }

  const existing = await db.mark.count({ where: { studentId: student.id, lessonId: lesson.id } });
  if (existing >= MAX_MARKS_PER_LESSON) {
    return { ok: false, error: `На одном занятии — не больше ${MAX_MARKS_PER_LESSON} оценок` };
  }

  await db.mark.create({
    data: {
      studentId: student.id,
      lessonId: lesson.id,
      lessonOid: lesson.oid,
      disciplineId: lesson.disciplineId,
      date: lesson.date,
      startTime: lesson.startTime,
      lessonKind: lesson.kind,
      value: input.value,
      createdById: ctx.staffId,
    },
  });
  return {
    ok: true,
    student: fio(student),
    discipline: lesson.discipline.name,
    date: dbDateToIso(lesson.date),
    start: lesson.startTime,
    value: input.value,
  };
}

export type RecentMark = {
  id: string;
  student: string;
  group: string;
  discipline: string;
  date: string;
  start: string;
  value: number;
  createdAt: Date;
};

/** Последние оценки, выставленные деканатом этого факультета (для проверки и исправления ошибок). */
export async function listRecentFacultyMarks(ctx: StaffContext, take = 10): Promise<RecentMark[]> {
  const rows = await db.mark.findMany({
    where: { student: { facultyId: ctx.facultyId }, createdById: { not: null } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      date: true,
      startTime: true,
      value: true,
      createdAt: true,
      discipline: { select: { name: true } },
      student: { select: { lastName: true, firstName: true, middleName: true, academicGroup: { select: { name: true } } } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    student: fio(m.student),
    group: m.student.academicGroup.name,
    discipline: m.discipline.name,
    date: dbDateToIso(m.date),
    start: m.startTime,
    value: m.value,
    createdAt: m.createdAt,
  }));
}

/** Удалить оценку студента своего факультета. false — не найдена (или чужая). */
export async function deleteFacultyMark(ctx: StaffContext, markId: string): Promise<boolean> {
  const { count } = await db.mark.deleteMany({ where: { id: markId, student: { facultyId: ctx.facultyId } } });
  return count > 0;
}
