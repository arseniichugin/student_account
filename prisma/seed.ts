/**
 * Демо-наполнение ПОВЕРХ импортированных данных вуза (npm run data:import).
 *
 * Вуз (факультеты, группы, студенты, расписание) seed больше не создаёт: всё берётся из базы,
 * поэтому скрипт работает с любыми заменёнными файлами data/university/*.
 * Он пересоздаёт только демо-контент: оценки, заявки, объявления, уведомления, дедлайны.
 * Всё вымышленное; совпадения с реальными людьми случайны.
 *
 * Запуск: npm run db:seed (после npm run data:import). Повторный запуск даёт тот же результат.
 */
import "dotenv/config";
import type { NotificationType, RequestStatus } from "@/lib/generated/prisma/client";
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

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
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

// Текущий учебный год: осенний семестр 2026 года.
const ACADEMIC_YEAR_START = 2026;
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
  /** Дисциплины академических групп факультета на курсе — для оценок прошлых лет. */
  const yearDisciplines = new Map<string, string[]>();
  for (const g of groups) {
    if (g.kind !== "ACADEMIC" || !g.facultyId || !g.course) continue;
    const key = `${g.facultyId}:${g.course}`;
    yearDisciplines.set(key, [...new Set([...(yearDisciplines.get(key) ?? []), ...disciplinesOf(g.id)])]);
  }

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
  // Оценки текущего семестра появятся вместе с назначениями преподавателей (следующий шаг).
  const grades: unknown[] = [];
  const debtSubject = new Map<string, string>();

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
  const [t1, t2, t3] = testStudents;
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
    const debt = debtSubject.get(t2.id);
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
          ? `Есть академическая задолженность по дисциплине «${debt}». Выписка будет доступна после пересдачи.`
          : "Есть академическая задолженность. Выписка будет доступна после пересдачи.",
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
