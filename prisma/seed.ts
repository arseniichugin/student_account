/**
 * Демо-наполнение ПОВЕРХ импортированных данных вуза (npm run data:import).
 *
 * Вуз (факультеты, группы, студенты, расписание) seed больше не создаёт: всё берётся из базы,
 * поэтому скрипт работает с любыми заменёнными файлами data/university/*.
 * Он пересоздаёт только демо-контент: оценки, заявки, объявления, уведомления, дедлайны.
 * Оценки — только текущего семестра (lib/grades/term.ts): 1-й срез у всех, 2-й — примерно у половины пар
 * «дисциплина × группа», 3-й срез и итоговые — пусто. Ставит «свой» преподаватель (TeachingAssignment).
 * Всё вымышленное; совпадения с реальными людьми случайны.
 *
 * Запуск: npm run db:seed (после npm run data:import). Повторный запуск даёт тот же результат.
 */
import "dotenv/config";
import type { NotificationType, RequestStatus } from "@/lib/generated/prisma/client";
import { gradeNotification } from "@/lib/grades/notification";
import { formatScored, scored } from "@/lib/grades/scale";
import { checkpointLabel, semesterForCourse } from "@/lib/grades/term";
import { dbDateToIso, moscowDateTime } from "@/lib/moscow-time";
import { createPrismaClient } from "@/lib/prisma-client";
import { formatDayMonthLong } from "@/lib/schedule/dates";

const db = createPrismaClient();

// ─── Детерминированный «случай» ─────────────────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Дата и время по Москве. */
const msk = (y: number, m: number, d: number, hh = 12, mm = 0) =>
  moscowDateTime(`${y}-${pad2(m)}-${pad2(d)}`, `${pad2(hh)}:${pad2(mm)}`);
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** «3 ноября» — тот же форматтер, что на экранах расписания. */
const ruDate = formatDayMonthLong;

// ─── Справочник заявок ──────────────────────────────────────────────

const REQUEST_TYPES = [
  {
    code: "STUDY_CERT",
    name: "Справка об обучении",
    description: "Подтверждает, что вы учитесь в университете. Нужна для работы, банка, соцзащиты, поликлиники.",
    etaDays: 2,
  },
  {
    code: "MILITARY_CERT",
    name: "Справка для военкомата",
    description: "Справка по форме для предоставления в военный комиссариат (отсрочка).",
    etaDays: 3,
  },
  {
    code: "SCHOLARSHIP_CERT",
    name: "Справка о размере стипендии",
    description: "Сумма стипендии за выбранный период — для соцзащиты, налоговой, банка.",
    etaDays: 3,
  },
  {
    code: "TRANSCRIPT",
    name: "Выписка оценок",
    description: "Список дисциплин и оценок за все завершённые семестры.",
    etaDays: 5,
  },
  {
    code: "ACADEMIC_LEAVE",
    name: "Заявление на академический отпуск",
    description: "Перерыв в учёбе по медицинским, семейным или иным причинам. Деканат свяжется для уточнения документов.",
    etaDays: 10,
  },
] as const;

type TypeCode = (typeof REQUEST_TYPES)[number]["code"];

const LECTURE_KINDS = new Set(["Лекция", "Консультация", "Экзамен", "Зачёт"]);

async function main() {
  const facultyCount = await db.faculty.count();
  if (facultyCount === 0) {
    console.error("В базе нет данных вуза. Сначала выполните: npm run data:import");
    process.exit(1);
  }

  // ─── Читаем то, что загрузил импорт ───────────────────────────────
  const faculties = await db.faculty.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, staff: { select: { userId: true }, take: 1 } },
  });
  const students = await db.student.findMany({
    orderBy: { externalId: "asc" },
    select: {
      id: true,
      externalId: true,
      userId: true,
      firstName: true,
      lastName: true,
      course: true,
      facultyId: true,
      academicGroupId: true,
      academicGroup: { select: { name: true } },
      languageGroups: { orderBy: { position: "asc" }, select: { groupId: true, position: true } },
      user: { select: { isDemo: true, login: true } },
    },
  });
  // Сортировка по ID как по числу, если ID числовые
  students.sort((a, b) => {
    const na = Number(a.externalId);
    const nb = Number(b.externalId);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.externalId.localeCompare(b.externalId);
  });
  const groups = await db.group.findMany({ select: { id: true, name: true, kind: true, course: true, facultyId: true } });
  const disciplines = new Map((await db.discipline.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));

  // Дисциплины каждой группы по расписанию: groupId → disciplineId → виды работ
  const lessonRows = await db.lesson.findMany({
    select: { disciplineId: true, kind: true, groups: { select: { groupId: true } } },
  });
  const groupDisciplines = new Map<string, Map<string, Set<string>>>();
  for (const l of lessonRows) {
    for (const { groupId } of l.groups) {
      const m = groupDisciplines.get(groupId) ?? new Map<string, Set<string>>();
      const kinds = m.get(l.disciplineId) ?? new Set<string>();
      kinds.add(l.kind);
      m.set(l.disciplineId, kinds);
      groupDisciplines.set(groupId, m);
    }
  }
  const disciplinesOf = (groupId: string) =>
    [...(groupDisciplines.get(groupId)?.keys() ?? [])].sort((a, b) => disciplines.get(a)!.localeCompare(disciplines.get(b)!, "ru"));

  // Тестовые студенты — в том же порядке, в каком их выбирает импорт: факультет №1, №2, №3…
  const facultyOrder = new Map(faculties.map((f, i) => [f.id, i]));
  const testStudents = students
    .filter((s) => s.user.isDemo)
    .sort((a, b) => facultyOrder.get(a.facultyId)! - facultyOrder.get(b.facultyId)! || a.course - b.course);
  const staffUserByFaculty = new Map(faculties.map((f) => [f.id, f.staff[0]?.userId ?? null]));

  // ─── Очистка демо-контента ────────────────────────────────────────
  console.log("Очищаю прежний демо-контент…");
  await db.$transaction([
    db.notification.deleteMany(),
    db.announcement.deleteMany(),
    db.request.deleteMany(),
    db.grade.deleteMany(),
    db.deadline.deleteMany(),
  ]);

  // ─── Типы заявок ──────────────────────────────────────────────────
  const typeId = new Map<TypeCode, string>();
  for (const t of REQUEST_TYPES) {
    const row = await db.requestType.upsert({ where: { code: t.code }, create: t, update: t, select: { id: true } });
    typeId.set(t.code, row.id);
  }

  // ─── Оценки ───────────────────────────────────────────────────────
  console.log("Оценки…");
  type SeedStudent = (typeof students)[number];
  const membersOf = new Map<string, SeedStudent[]>();
  for (const s of students) {
    for (const g of [s.academicGroupId, ...s.languageGroups.map((x) => x.groupId)]) {
      membersOf.set(g, [...(membersOf.get(g) ?? []), s]);
    }
  }
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const assignments = await db.teachingAssignment.findMany({
    orderBy: { teacherId: "asc" },
    select: { teacherId: true, disciplineId: true, groupId: true, teacher: { select: { shortName: true, user: { select: { isDemo: true } } } } },
  });
  // Пары «дисциплина × группа» и их семинаристы (у трёх пар в данных — по двое)
  const pairs = new Map<string, { disciplineId: string; groupId: string; teacherIds: string[] }>();
  for (const a of assignments) {
    const key = `${a.disciplineId}:${a.groupId}`;
    const pair = pairs.get(key) ?? { disciplineId: a.disciplineId, groupId: a.groupId, teacherIds: [] };
    pair.teacherIds.push(a.teacherId);
    pairs.set(key, pair);
  }
  const teacherName = new Map(assignments.map((a) => [a.teacherId, a.teacher.shortName]));

  // Тестовый преподаватель 1 — тот, кто ведёт семинары у тестового студента 1. Его пары с этим студентом
  // остаются без 2-го среза: жюри само ставит оценку и видит её у студента.
  const [t1, t2, t3] = testStudents;
  const groupsOf = (s: SeedStudent) => new Set([s.academicGroupId, ...s.languageGroups.map((g) => g.groupId)]);
  const t1Groups = t1 ? groupsOf(t1) : new Set<string>();
  const testTeacher1 = assignments.find((a) => a.teacher.user?.isDemo && t1Groups.has(a.groupId))?.teacherId ?? null;
  const keepSecondEmpty = (p: { groupId: string; teacherIds: string[] }) =>
    !!testTeacher1 && p.teacherIds.includes(testTeacher1) && t1Groups.has(p.groupId);

  // «Долг» тестового студента 2: FX за 1-й срез — по дисциплине тестового преподавателя 2, если он его ведёт
  // (жюри может само «принять пересдачу»), иначе по первой по алфавиту дисциплине
  const t2Pairs = t2 ? [...pairs.values()].filter((p) => groupsOf(t2).has(p.groupId)) : [];
  const demoTeacherIds = new Set(assignments.filter((a) => a.teacher.user?.isDemo).map((a) => a.teacherId));
  const debtPair =
    t2Pairs.find((p) => p.teacherIds.some((id) => demoTeacherIds.has(id) && id !== testTeacher1)) ??
    t2Pairs.sort((a, b) => disciplines.get(a.disciplineId)!.localeCompare(disciplines.get(b.disciplineId)!, "ru"))[0];
  const debtSubject = debtPair ? disciplines.get(debtPair.disciplineId)! : null;
  const debtPoints = 45 + (t2 ? hash(`debt:${t2.externalId}`) % 12 : 0); // 45–56 — FX

  const grades: {
    studentId: string;
    disciplineId: string;
    semester: number;
    kind: "CHECKPOINT";
    checkpoint: number;
    points: number;
    gradedByTeacherId: string;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];
  const seen = new Set<string>();
  for (const pair of [...pairs.values()].sort((a, b) => a.disciplineId.localeCompare(b.disciplineId) || a.groupId.localeCompare(b.groupId))) {
    const pairName = `${disciplines.get(pair.disciplineId)}|${groupName.get(pair.groupId)}`;
    const teacherId = testTeacher1 && pair.teacherIds.includes(testTeacher1) ? testTeacher1 : pair.teacherIds[0]!;
    // 2-й срез — примерно у половины пар, детерминированно по названиям (не по id: они меняются при пересоздании базы)
    const second = !keepSecondEmpty(pair) && hash(`second:${pairName}`) % 2 === 0;
    for (const s of membersOf.get(pair.groupId) ?? []) {
      const key = `${s.id}:${pair.disciplineId}`;
      if (seen.has(key)) continue; // студент в двух группах с одной дисциплиной — оценки одни
      seen.add(key);
      const rand = rng(`grades:${s.externalId}:${pairName}`);
      // «Сильный» или «слабый» студент — от 64 до 95 в среднем; изредка FX у обычных студентов (не у тестовых).
      // Разброс ±10 вокруг уровня студента. То, что выходит за шкалу, не «прижимаем» к границе (иначе
      // всплеск ровно 60 и ровно 100 баллов), а разбрасываем внутрь: ниже 60 → 60–75, выше 100 → 86–100.
      const base = 64 + (hash(`ability:${s.externalId}`) % 32);
      const points = () => {
        if (!s.user.isDemo && rand() < 0.03) return 35 + Math.floor(rand() * 25);
        const p = base + Math.round((rand() - 0.5) * 20);
        if (p < 60) return 60 + Math.floor(rand() * 16);
        if (p > 100) return 86 + Math.floor(rand() * 15);
        return p;
      };
      const semester = semesterForCourse(s.course);
      const first = s.id === t2?.id && pair === debtPair ? debtPoints : points();
      const firstAt = msk(2026, 10, 5 + Math.floor(rand() * 5), 10 + Math.floor(rand() * 8));
      grades.push({
        studentId: s.id,
        disciplineId: pair.disciplineId,
        semester,
        kind: "CHECKPOINT",
        checkpoint: 1,
        points: first,
        gradedByTeacherId: teacherId,
        createdAt: firstAt,
        updatedAt: firstAt,
      });
      if (second) {
        const secondAt = msk(2026, 11, 5 + Math.floor(rand() * 5), 10 + Math.floor(rand() * 8));
        grades.push({
          studentId: s.id,
          disciplineId: pair.disciplineId,
          semester,
          kind: "CHECKPOINT",
          checkpoint: 2,
          points: points(),
          gradedByTeacherId: teacherId,
          createdAt: secondAt,
          updatedAt: secondAt,
        });
      }
    }
  }
  for (let i = 0; i < grades.length; i += 5000) await db.grade.createMany({ data: grades.slice(i, i + 5000) });

  // ─── Заявки ───────────────────────────────────────────────────────
  console.log("Заявки…");
  const rooms = await db.room.findMany({ where: { purpose: { startsWith: "Деканат" } }, select: { number: true, purpose: true } });
  const deanRoom = (facultyId: string) => {
    const f = faculties.find((x) => x.id === facultyId)!;
    const word = f.name.split(/\s+/).at(-1)!;
    const r = rooms.find((x) => x.purpose!.includes(word));
    return r ? `в деканате, ауд. ${r.number}` : "в деканате";
  };

  type RequestSeed = {
    studentId: string;
    code: TypeCode;
    status: RequestStatus;
    destination: string;
    copies?: number;
    comment?: string;
    staffComment?: string | null;
    createdAt: Date;
  };
  const requests: RequestSeed[] = [];
  if (t1) {
    requests.push(
      {
        studentId: t1.id,
        code: "STUDY_CERT",
        status: "READY",
        destination: "По месту работы",
        staffComment: `Справка готова. Заберите ${deanRoom(t1.facultyId)} (пн–пт, 10:00–16:00).`,
        createdAt: msk(2026, 11, 3, 11, 20),
      },
      {
        studentId: t1.id,
        code: "SCHOLARSHIP_CERT",
        status: "IN_PROGRESS",
        destination: "Отдел социальной защиты",
        comment: "За сентябрь–октябрь",
        createdAt: msk(2026, 11, 6, 15, 5),
      },
    );
  }
  if (t2) {
    const debt = debtSubject;
    requests.push(
      {
        studentId: t2.id,
        code: "MILITARY_CERT",
        status: "ISSUED",
        destination: "Военный комиссариат",
        staffComment: "Выдана 22.10.",
        createdAt: msk(2026, 10, 19, 9, 40),
      },
      {
        studentId: t2.id,
        code: "TRANSCRIPT",
        status: "REJECTED",
        destination: "Для стажировки",
        copies: 2,
        staffComment: debt
          ? `По дисциплине «${debt}» за 1-й срез стоит ${formatScored(scored(debtPoints))} — неудовлетворительно. ` +
            "Пересдайте срез преподавателю и подайте заявку снова: выписку для стажировки выдаём без задолженностей."
          : "Есть неудовлетворительная оценка за срез. Пересдайте её и подайте заявку снова.",
        createdAt: msk(2026, 11, 2, 13, 0),
      },
      {
        studentId: t2.id,
        code: "STUDY_CERT",
        status: "SUBMITTED",
        destination: "Для оформления социальной карты",
        createdAt: msk(2026, 11, 7, 18, 30),
      },
    );
  }
  if (t3) {
    requests.push(
      { studentId: t3.id, code: "STUDY_CERT", status: "SUBMITTED", destination: "В банк", createdAt: msk(2026, 11, 8, 10, 15) },
      {
        studentId: t3.id,
        code: "TRANSCRIPT",
        status: "READY",
        destination: "Для программы обмена",
        copies: 2,
        staffComment: `Выписка готова. Заберите ${deanRoom(t3.facultyId)}.`,
        createdAt: msk(2026, 11, 4, 16, 45),
      },
    );
  }
  // Очередь каждого деканата: ещё по 4 заявки от обычных студентов факультета
  const QUEUE: { code: TypeCode; status: RequestStatus; destination: string; staffComment?: string }[] = [
    { code: "STUDY_CERT", status: "SUBMITTED", destination: "По месту работы родителей" },
    { code: "SCHOLARSHIP_CERT", status: "SUBMITTED", destination: "В налоговую инспекцию" },
    { code: "MILITARY_CERT", status: "IN_PROGRESS", destination: "Военный комиссариат" },
    { code: "STUDY_CERT", status: "READY", destination: "В поликлинику", staffComment: "Справка готова." },
  ];
  for (const f of faculties) {
    const pool = students.filter((s) => s.facultyId === f.id && !s.user.isDemo);
    QUEUE.forEach((q, i) => {
      const s = pool[Math.floor(((i + 0.5) * pool.length) / QUEUE.length)];
      if (s) requests.push({ studentId: s.id, ...q, createdAt: msk(2026, 11, 2 + i * 2, 9 + i, 10 * i) });
    });
  }
  const createdRequests: { id: string; studentId: string; status: RequestStatus; code: TypeCode; staffComment?: string | null }[] = [];
  for (const r of requests) {
    const row = await db.request.create({
      data: {
        studentId: r.studentId,
        typeId: typeId.get(r.code)!,
        status: r.status,
        payload: { destination: r.destination, copies: r.copies ?? 1, comment: r.comment ?? "" },
        staffComment: r.staffComment ?? null,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
      },
      select: { id: true },
    });
    createdRequests.push({ id: row.id, studentId: r.studentId, status: r.status, code: r.code, staffComment: r.staffComment });
  }

  // ─── Дедлайны ─────────────────────────────────────────────────────
  console.log("Дедлайны…");
  const TASKS = [
    (d: string) => `Контрольная работа №2 по дисциплине «${d}»`,
    (d: string) => `${d}: реферат — сдать преподавателю`,
    (d: string) => `${d}: домашнее задание к семинару`,
    (d: string) => `${d}: проект — промежуточная сдача`,
  ];
  const LANGUAGE_TASKS = [
    (d: string) => `${d}: эссе на 250 слов`,
    (d: string) => `${d}: домашнее чтение — пересказ текста`,
  ];
  const deadlines: { groupId: string; disciplineId: string | null; title: string; dueAt: Date }[] = [];
  for (const g of groups) {
    const rand = rng(`deadlines:${g.name}`);
    const practical = disciplinesOf(g.id).filter((d) => [...groupDisciplines.get(g.id)!.get(d)!].some((k) => !LECTURE_KINDS.has(k)));
    const list = g.kind === "ACADEMIC" ? practical.slice(0, 3) : practical.slice(0, 1);
    list.forEach((d, i) => {
      const tasks = g.kind === "ACADEMIC" ? TASKS : LANGUAGE_TASKS;
      // С 13 ноября по 18 декабря, обычно в 23:59
      const day = 13 + Math.floor(rand() * 36);
      const date = new Date(Date.UTC(2026, 10, day));
      deadlines.push({
        groupId: g.id,
        disciplineId: d,
        title: tasks[(i + hash(g.name)) % tasks.length]!(disciplines.get(d)!),
        dueAt: msk(2026, date.getUTCMonth() + 1, date.getUTCDate(), 23, 59),
      });
    });
    if (g.kind === "ACADEMIC" && g.course === 1) {
      deadlines.push({
        groupId: g.id,
        disciplineId: null,
        title: "Сдать фото для студенческого билета в деканат",
        dueAt: msk(2026, 11, 20, 17, 0),
      });
    }
  }
  await db.deadline.createMany({ data: deadlines });

  // ─── Объявления ───────────────────────────────────────────────────
  console.log("Объявления…");
  const sessionDates = new Map<string, { from: string; to: string }>();
  for (const f of faculties) {
    const exam = await db.lesson.aggregate({
      where: { kind: "Экзамен", groups: { some: { group: { facultyId: f.id } } } },
      _min: { date: true },
      _max: { date: true },
    });
    if (exam._min.date && exam._max.date) sessionDates.set(f.id, { from: dbDateToIso(exam._min.date), to: dbDateToIso(exam._max.date) });
  }
  const courses = [...new Set(students.map((s) => s.course))].sort((a, b) => a - b);
  type AnnouncementSeed = {
    authorId: string;
    title: string;
    body: string;
    facultyId?: string | null;
    course?: number | null;
    publishedAt: Date;
  };
  const announcements: AnnouncementSeed[] = [];
  for (const f of faculties) {
    const author = staffUserByFaculty.get(f.id);
    if (!author) continue;
    const session = sessionDates.get(f.id);
    announcements.push({
      authorId: author,
      title: "График зимней сессии опубликован",
      body: session
        ? `Экзамены пройдут с ${ruDate(session.from)} по ${ruDate(session.to)}. ` +
          "Консультации — за 1–2 дня до экзамена, время и аудитории смотрите в расписании."
        : "Расписание экзаменов появится в кабинете за месяц до начала сессии.",
      facultyId: f.id,
      publishedAt: msk(2026, 11, 6, 12, 0),
    });
    if (courses[0] !== undefined) {
      announcements.push({
        authorId: author,
        title: "Посвящение в студенты",
        body: `20 ноября в 18:00 — посвящение для первокурсников. ${f.name} ждёт всех в Большом зале. Приходите с одногруппниками!`,
        facultyId: f.id,
        course: courses[0],
        publishedAt: msk(2026, 11, 2, 9, 0),
      });
    }
    const last = courses.at(-1);
    if (last !== undefined && last !== courses[0]) {
      announcements.push({
        authorId: author,
        title: "Выбор темы выпускной работы",
        body:
          `Студенты ${last} курса: до 10 декабря выберите тему и научного руководителя. ` +
          "Список тем — на кафедрах, вопросы — в деканате.",
        facultyId: f.id,
        course: last,
        publishedAt: msk(2026, 11, 5, 10, 0),
      });
    }
  }
  const firstStaff = staffUserByFaculty.get(faculties[0]!.id);
  if (firstStaff) {
    announcements.push({
      authorId: firstStaff,
      title: "Неделя открытых библиотек",
      body: "С 16 по 20 ноября библиотека и читальный зал работают до 21:00. Приходите готовиться к контрольным!",
      publishedAt: msk(2026, 11, 7, 9, 0),
    });
  }
  await db.announcement.createMany({ data: announcements });

  // ─── Уведомления ──────────────────────────────────────────────────
  console.log("Уведомления…");
  type NotificationSeed = {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string | null;
    createdAt: Date;
    readAt?: Date | null;
  };
  const notifications: NotificationSeed[] = [];
  const studentById = new Map(students.map((s) => [s.id, s]));
  const typeName = new Map(REQUEST_TYPES.map((t) => [t.code, t.name]));
  for (const r of createdRequests) {
    if (r.status === "SUBMITTED" || r.status === "IN_PROGRESS") continue;
    const s = studentById.get(r.studentId)!;
    const statusText = { READY: "готова", ISSUED: "выдана", REJECTED: "отклонена" }[r.status as "READY" | "ISSUED" | "REJECTED"];
    notifications.push({
      userId: s.userId,
      type: "REQUEST_STATUS",
      title: `${typeName.get(r.code)}: ${statusText}`,
      body: r.staffComment || "Статус вашей заявки изменился.",
      link: `/requests/${r.id}`,
      createdAt: msk(2026, 11, 8, 14, 0),
      readAt: r.status === "ISSUED" ? msk(2026, 11, 8, 15, 0) : null,
    });
  }
  for (const s of testStudents) {
    const myGroups = [s.academicGroupId, ...s.languageGroups.map((g) => g.groupId)];
    const deadline = deadlines.filter((d) => myGroups.includes(d.groupId)).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
    if (deadline) {
      notifications.push({
        userId: s.userId,
        type: "DEADLINE",
        title: `Скоро срок: ${deadline.title}`,
        body: `Сдать до ${ruDate(deadline.dueAt.toISOString().slice(0, 10))}, 23:59.`,
        createdAt: msk(2026, 11, 9, 9, 0),
      });
    }
    const change = await db.lesson.findFirst({
      where: {
        status: { not: "NORMAL" },
        date: { gte: new Date("2026-11-09T00:00:00Z") },
        groups: { some: { groupId: { in: myGroups } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: { date: true, startTime: true, status: true, note: true, discipline: { select: { name: true } } },
    });
    if (change) {
      const what = { MOVED: "перенос", CANCELLED: "отмена", REPLACED: "замена преподавателя", NORMAL: "изменение" }[change.status];
      notifications.push({
        userId: s.userId,
        type: "SCHEDULE_CHANGE",
        title: `${change.discipline.name}: ${what}`,
        body: `${ruDate(dbDateToIso(change.date))}, ${change.startTime}. ${change.note ?? "Подробности — в расписании."}`,
        createdAt: msk(2026, 11, 8, 18, 0),
      });
    }
    // Последняя выставленная оценка — уведомление того же вида, что создаёт журнал преподавателя
    const myGrades = grades.filter((g) => g.studentId === s.id);
    const latest = (s === t2 && debtPair ? myGrades.filter((g) => g.disciplineId === debtPair.disciplineId && g.checkpoint === 1) : myGrades)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (latest) {
      const n = gradeNotification({
        discipline: disciplines.get(latest.disciplineId)!,
        kind: "CHECKPOINT",
        checkpoint: latest.checkpoint,
        points: latest.points,
        teacher: teacherName.get(latest.gradedByTeacherId),
      });
      notifications.push({ userId: s.userId, type: "GRADE", ...n, createdAt: latest.createdAt });
    }
    const ann = announcements.find((a) => a.facultyId === s.facultyId && (a.course == null || a.course === s.course));
    if (ann) {
      notifications.push({ userId: s.userId, type: "ANNOUNCEMENT", title: ann.title, body: ann.body, createdAt: ann.publishedAt });
    }
  }
  await db.notification.createMany({ data: notifications });

  console.log(
    `\nГотово: оценок ${grades.length}, заявок ${createdRequests.length}, дедлайнов ${deadlines.length}, ` +
      `объявлений ${announcements.length}, уведомлений ${notifications.length}.`,
  );
  console.log(`Тестовые студенты: ${testStudents.map((s) => s.user.login).join(", ") || "нет (запустите npm run data:import)"}`);
  if (debtSubject) console.log(`  долг у ${t2!.user.login}: «${debtSubject}», ${checkpointLabel(1)} — ${formatScored(scored(debtPoints))}`);
  const emptySecond = [...pairs.values()].filter(keepSecondEmpty);
  if (emptySecond.length) {
    console.log(
      `  без 2-го среза для жюри (тестовый преподаватель 1): ` +
        emptySecond.map((p) => `${disciplines.get(p.disciplineId)} — ${groupName.get(p.groupId)}`).join("; "),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
