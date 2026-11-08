/**
 * Наполнение базы ВЫМЫШЛЕННЫМИ данными для демонстрации.
 * Университет «Горизонт», все люди, оценки и номера зачёток придуманы;
 * любые совпадения с реальными людьми случайны.
 *
 * Запуск: npm run db:seed (база очищается и заполняется заново).
 */
import "dotenv/config";
import { hashPassword } from "../lib/auth/password";
import { createPrismaClient } from "../lib/prisma-client";
import type { GradeKind, LessonType } from "../lib/generated/prisma/client";

const db = createPrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "Gorizont2026";

// ─── Время ──────────────────────────────────────────────────────────
// Все времена — по Москве (UTC+3, без перехода на летнее время).
const MSK_OFFSET_H = 3;

/** Дата и время по Москве → Date (UTC). */
function msk(y: number, m: number, d: number, hh = 0, mm = 0) {
  return new Date(Date.UTC(y, m - 1, d, hh - MSK_OFFSET_H, mm));
}

const PAIRS = [
  { start: [9, 0], end: [10, 30] },
  { start: [10, 45], end: [12, 15] },
  { start: [13, 0], end: [14, 30] },
  { start: [14, 45], end: [16, 15] },
  { start: [16, 30], end: [18, 0] },
] as const;

const SEMESTER_START = msk(2026, 9, 1); // вторник, 1 сентября
const SEMESTER_END = msk(2026, 12, 27);

// ─── Справочники ────────────────────────────────────────────────────

const TEACHERS = [
  "Орлов Виктор Петрович",
  "Зайцева Марина Игоревна",
  "Гусев Алексей Романович",
  "Карпова Елена Викторовна",
  "Тихонов Сергей Ильич",
  "Нестерова Ирина Павловна",
  "Миронов Павел Андреевич",
  "Фролова Дарья Олеговна",
];

type WeeklySlot = {
  weekday: 1 | 2 | 3 | 4 | 5; // пн..пт
  pair: 0 | 1 | 2 | 3 | 4;
  subject: string;
  type: LessonType;
  teacher: number; // индекс в TEACHERS
  room: string;
};

const PI_SCHEDULE: WeeklySlot[] = [
  { weekday: 1, pair: 0, subject: "Базы данных", type: "LECTURE", teacher: 0, room: "Г-305" },
  { weekday: 1, pair: 1, subject: "Базы данных", type: "LAB", teacher: 0, room: "Г-412" },
  { weekday: 1, pair: 2, subject: "Английский язык", type: "SEMINAR", teacher: 5, room: "А-210" },
  { weekday: 2, pair: 1, subject: "Веб-разработка", type: "LECTURE", teacher: 1, room: "Г-301" },
  { weekday: 2, pair: 2, subject: "Веб-разработка", type: "LAB", teacher: 1, room: "Г-414" },
  { weekday: 3, pair: 0, subject: "Операционные системы", type: "LECTURE", teacher: 2, room: "Г-305" },
  { weekday: 3, pair: 1, subject: "Теория вероятностей", type: "SEMINAR", teacher: 3, room: "Б-118" },
  { weekday: 3, pair: 2, subject: "Операционные системы", type: "LAB", teacher: 2, room: "Г-410" },
  { weekday: 4, pair: 1, subject: "Проектирование ПО", type: "LECTURE", teacher: 4, room: "Г-201" },
  { weekday: 4, pair: 2, subject: "Проектирование ПО", type: "SEMINAR", teacher: 4, room: "Г-207" },
  { weekday: 5, pair: 0, subject: "Теория вероятностей", type: "LECTURE", teacher: 3, room: "Б-101" },
  { weekday: 5, pair: 1, subject: "Английский язык", type: "SEMINAR", teacher: 5, room: "А-210" },
];

const EK_SCHEDULE: WeeklySlot[] = [
  { weekday: 1, pair: 1, subject: "Микроэкономика", type: "LECTURE", teacher: 6, room: "Э-101" },
  { weekday: 1, pair: 2, subject: "Математический анализ", type: "SEMINAR", teacher: 3, room: "Б-120" },
  { weekday: 2, pair: 0, subject: "Математический анализ", type: "LECTURE", teacher: 3, room: "Б-101" },
  { weekday: 2, pair: 1, subject: "История России", type: "LECTURE", teacher: 7, room: "А-301" },
  { weekday: 3, pair: 1, subject: "Микроэкономика", type: "SEMINAR", teacher: 6, room: "Э-204" },
  { weekday: 3, pair: 2, subject: "Информатика", type: "LAB", teacher: 1, room: "Г-414" },
  { weekday: 4, pair: 0, subject: "Английский язык", type: "SEMINAR", teacher: 5, room: "А-212" },
  { weekday: 4, pair: 1, subject: "История России", type: "SEMINAR", teacher: 7, room: "А-305" },
  { weekday: 5, pair: 1, subject: "Математический анализ", type: "SEMINAR", teacher: 3, room: "Б-120" },
  { weekday: 5, pair: 2, subject: "Физическая культура", type: "SEMINAR", teacher: 2, room: "Спортзал" },
];

const PAST_SUBJECTS_PI: { semester: number; subject: string; kind: GradeKind }[] = [
  { semester: 1, subject: "Математический анализ", kind: "EXAM" },
  { semester: 1, subject: "Программирование на Python", kind: "EXAM" },
  { semester: 1, subject: "История России", kind: "CREDIT" },
  { semester: 1, subject: "Английский язык", kind: "CREDIT" },
  { semester: 2, subject: "Линейная алгебра", kind: "EXAM" },
  { semester: 2, subject: "Алгоритмы и структуры данных", kind: "EXAM" },
  { semester: 2, subject: "Физическая культура", kind: "CREDIT" },
  { semester: 3, subject: "Дискретная математика", kind: "EXAM" },
  { semester: 3, subject: "Объектно-ориентированное программирование", kind: "EXAM" },
  { semester: 3, subject: "Курсовая работа по ООП", kind: "COURSEWORK" },
  { semester: 3, subject: "Английский язык", kind: "CREDIT" },
  { semester: 4, subject: "Компьютерные сети", kind: "EXAM" },
  { semester: 4, subject: "Архитектура ЭВМ", kind: "EXAM" },
  { semester: 4, subject: "Экономика", kind: "CREDIT" },
];

const CURRENT_SUBJECTS_PI = [
  "Базы данных",
  "Веб-разработка",
  "Операционные системы",
  "Теория вероятностей",
  "Проектирование ПО",
  "Английский язык",
];

const CURRENT_SUBJECTS_EK = [
  "Микроэкономика",
  "Математический анализ",
  "История России",
  "Информатика",
  "Английский язык",
];

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
];

// ─── Утилиты ────────────────────────────────────────────────────────

/** Детерминированный генератор псевдослучайных чисел — данные одинаковы при каждом запуске. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

// ─── Основной сценарий ──────────────────────────────────────────────

async function clear() {
  // Порядок важен из-за внешних ключей.
  await db.notification.deleteMany();
  await db.announcement.deleteMany();
  await db.request.deleteMany();
  await db.requestType.deleteMany();
  await db.grade.deleteMany();
  await db.deadline.deleteMany();
  await db.lesson.deleteMany();
  await db.subject.deleteMany();
  await db.teacher.deleteMany();
  await db.student.deleteMany();
  await db.staff.deleteMany();
  await db.session.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.user.deleteMany();
  await db.group.deleteMany();
  await db.program.deleteMany();
  await db.faculty.deleteMany();
}

async function main() {
  console.log("Очистка базы…");
  await clear();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // Структура вуза
  const fit = await db.faculty.create({ data: { name: "Факультет информационных технологий", short: "ФИТ" } });
  const ef = await db.faculty.create({ data: { name: "Экономический факультет", short: "ЭФ" } });

  const pi = await db.program.create({
    data: { code: "09.03.04", name: "Программная инженерия", facultyId: fit.id },
  });
  const ek = await db.program.create({ data: { code: "38.03.01", name: "Экономика", facultyId: ef.id } });

  const groupPi = await db.group.create({ data: { name: "ПИ-24-1", course: 3, programId: pi.id } });
  const groupEk = await db.group.create({ data: { name: "ЭК-26-2", course: 1, programId: ek.id } });

  // Пользователи
  async function createStudent(
    login: string,
    groupId: string,
    fio: [string, string, string],
    recordBookNo: string,
  ) {
    const user = await db.user.create({ data: { login, passwordHash, role: "STUDENT" } });
    const student = await db.student.create({
      data: {
        userId: user.id,
        groupId,
        lastName: fio[0],
        firstName: fio[1],
        middleName: fio[2],
        recordBookNo,
      },
    });
    return { user, student };
  }

  const dima = await createStudent("dima.sokolov", groupPi.id, ["Соколов", "Дмитрий", "Андреевич"], "24-ПИ-0117");
  const timur = await createStudent("timur.kim", groupPi.id, ["Ким", "Тимур", "Олегович"], "24-ПИ-0142");
  const anna = await createStudent("anna.belova", groupEk.id, ["Белова", "Анна", "Сергеевна"], "26-ЭК-0308");

  const staffFitUser = await db.user.create({ data: { login: "dekanat.fit", passwordHash, role: "STAFF" } });
  await db.staff.create({
    data: {
      userId: staffFitUser.id,
      facultyId: fit.id,
      fullName: "Морозова Ольга Сергеевна",
      position: "Специалист по учебной работе",
    },
  });
  const staffEfUser = await db.user.create({ data: { login: "dekanat.ef", passwordHash, role: "STAFF" } });
  await db.staff.create({
    data: {
      userId: staffEfUser.id,
      facultyId: ef.id,
      fullName: "Лебедев Игорь Павлович",
      position: "Специалист по учебной работе",
    },
  });

  // Преподаватели и дисциплины
  const teachers = await Promise.all(TEACHERS.map((fullName) => db.teacher.create({ data: { fullName } })));
  const subjectNames = new Set<string>([
    ...PI_SCHEDULE.map((s) => s.subject),
    ...EK_SCHEDULE.map((s) => s.subject),
    ...PAST_SUBJECTS_PI.map((s) => s.subject),
  ]);
  const subjects = new Map<string, string>();
  for (const name of subjectNames) {
    const s = await db.subject.create({ data: { name } });
    subjects.set(name, s.id);
  }
  const subjectId = (name: string) => subjects.get(name)!;

  // Расписание на весь семестр + переносы и отмены каждую неделю
  console.log("Расписание…");
  async function buildSchedule(groupId: string, slots: WeeklySlot[], seed: number) {
    const rand = rng(seed);
    const lessons = [];
    for (let day = SEMESTER_START; day <= SEMESTER_END; day = addDays(day, 1)) {
      const local = new Date(day.getTime() + MSK_OFFSET_H * 3_600_000);
      const weekday = local.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const y = local.getUTCFullYear();
      const m = local.getUTCMonth() + 1;
      const d = local.getUTCDate();
      // 4 ноября — праздник
      if (m === 11 && d === 4) continue;

      for (const slot of slots.filter((s) => s.weekday === weekday)) {
        const pair = PAIRS[slot.pair];
        const base = {
          groupId,
          subjectId: subjectId(slot.subject),
          teacherId: teachers[slot.teacher]!.id,
          type: slot.type,
          room: slot.room,
          startsAt: msk(y, m, d, pair.start[0], pair.start[1]),
          endsAt: msk(y, m, d, pair.end[0], pair.end[1]),
        };
        const roll = rand();
        if (roll < 0.04) {
          lessons.push({ ...base, status: "CANCELLED" as const });
        } else if (roll < 0.1 && slot.pair < 4) {
          // Перенос: на следующую пару или в другую аудиторию
          const moveTime = rand() < 0.5;
          const next = PAIRS[slot.pair + 1]!;
          lessons.push({
            ...base,
            status: "MOVED" as const,
            originalStartsAt: base.startsAt,
            originalRoom: base.room,
            room: moveTime ? base.room : pick(rand, ["Г-101", "Б-204", "А-118", "Г-220"]),
            ...(moveTime
              ? {
                  startsAt: msk(y, m, d, next.start[0], next.start[1]),
                  endsAt: msk(y, m, d, next.end[0], next.end[1]),
                }
              : {}),
          });
        } else {
          lessons.push(base);
        }
      }
    }
    await db.lesson.createMany({ data: lessons });
    return lessons.length;
  }
  const nPi = await buildSchedule(groupPi.id, PI_SCHEDULE, 24);
  const nEk = await buildSchedule(groupEk.id, EK_SCHEDULE, 26);
  console.log(`  ПИ-24-1: ${nPi} занятий, ЭК-26-2: ${nEk} занятий`);

  // Дедлайны
  await db.deadline.createMany({
    data: [
      { groupId: groupPi.id, subjectId: subjectId("Базы данных"), title: "Лабораторная №4: индексы и планы запросов", dueAt: msk(2026, 11, 13, 23, 59) },
      { groupId: groupPi.id, subjectId: subjectId("Веб-разработка"), title: "Проект: прототип SPA — промежуточная сдача", dueAt: msk(2026, 11, 18, 23, 59) },
      { groupId: groupPi.id, subjectId: subjectId("Проектирование ПО"), title: "Курсовой проект: техническое задание", dueAt: msk(2026, 11, 25, 18, 0) },
      { groupId: groupPi.id, subjectId: subjectId("Операционные системы"), title: "Лабораторная №5: процессы и потоки", dueAt: msk(2026, 12, 2, 23, 59) },
      { groupId: groupPi.id, title: "Выбор темы ВКР — анкета в деканате", dueAt: msk(2026, 12, 10, 17, 0) },
      { groupId: groupEk.id, subjectId: subjectId("Микроэкономика"), title: "Эссе «Эластичность спроса»", dueAt: msk(2026, 11, 12, 23, 59) },
      { groupId: groupEk.id, subjectId: subjectId("Математический анализ"), title: "Контрольная работа №2", dueAt: msk(2026, 11, 20, 9, 0) },
      { groupId: groupEk.id, subjectId: subjectId("Информатика"), title: "Практикум в Excel: сводные таблицы", dueAt: msk(2026, 11, 27, 23, 59) },
      { groupId: groupEk.id, title: "Оформить студенческий билет (фото в деканат)", dueAt: msk(2026, 11, 16, 17, 0) },
    ],
  });

  // Оценки
  console.log("Оценки…");
  async function pastGrades(studentId: string, seed: number, debts: string[] = []) {
    const rand = rng(seed);
    await db.grade.createMany({
      data: PAST_SUBJECTS_PI.map((g) => {
        const isDebt = debts.includes(g.subject);
        let value: string;
        if (g.kind === "CREDIT") value = isDebt ? "не зачтено" : "зачтено";
        else value = isDebt ? "2" : String(pick(rand, [3, 4, 4, 5, 5, 5]));
        const month = g.semester % 2 === 1 ? 1 : 6;
        const year = 2024 + Math.ceil(g.semester / 2);
        return {
          studentId,
          subjectId: subjectId(g.subject),
          semester: g.semester,
          kind: g.kind,
          value,
          date: msk(year, month, 15 + Math.floor(rand() * 10)),
        };
      }),
    });
  }
  await pastGrades(dima.student.id, 117);
  await pastGrades(timur.student.id, 142, ["Компьютерные сети"]);

  // Текущий семестр: контрольные точки (часть ещё не выставлена)
  async function midterms(studentId: string, semester: number, list: string[], seed: number) {
    const rand = rng(seed);
    await db.grade.createMany({
      data: list.map((subject, i) => ({
        studentId,
        subjectId: subjectId(subject),
        semester,
        kind: "MIDTERM" as const,
        value: i === list.length - 1 ? null : String(pick(rand, [3, 4, 5, 5])),
        date: i === list.length - 1 ? null : msk(2026, 10, 20 + i),
      })),
    });
  }
  await midterms(dima.student.id, 5, CURRENT_SUBJECTS_PI, 5117);
  await midterms(timur.student.id, 5, CURRENT_SUBJECTS_PI, 5142);
  await midterms(anna.student.id, 1, CURRENT_SUBJECTS_EK, 1308);

  // Заявки
  console.log("Заявки…");
  const types = new Map<string, string>();
  for (const t of REQUEST_TYPES) {
    const created = await db.requestType.create({ data: t });
    types.set(t.code, created.id);
  }
  const typeId = (code: string) => types.get(code)!;

  const requests = [
    { studentId: dima.student.id, typeId: typeId("STUDY_CERT"), status: "READY" as const, payload: { destination: "По месту работы", copies: 1, comment: "" }, staffComment: "Справка готова. Заберите в ауд. Г-112 (пн–пт, 10:00–16:00).", createdAt: msk(2026, 11, 3, 11, 20) },
    { studentId: dima.student.id, typeId: typeId("SCHOLARSHIP_CERT"), status: "IN_PROGRESS" as const, payload: { destination: "Отдел социальной защиты", copies: 1, comment: "За сентябрь–октябрь" }, staffComment: null, createdAt: msk(2026, 11, 6, 15, 5) },
    { studentId: timur.student.id, typeId: typeId("MILITARY_CERT"), status: "ISSUED" as const, payload: { destination: "Военный комиссариат", copies: 1, comment: "" }, staffComment: "Выдана 22.10.", createdAt: msk(2026, 10, 19, 9, 40) },
    { studentId: timur.student.id, typeId: typeId("TRANSCRIPT"), status: "REJECTED" as const, payload: { destination: "Для стажировки", copies: 2, comment: "" }, staffComment: "Есть академическая задолженность по «Компьютерным сетям». Выписка будет доступна после пересдачи.", createdAt: msk(2026, 11, 2, 13, 0) },
    { studentId: anna.student.id, typeId: typeId("STUDY_CERT"), status: "SUBMITTED" as const, payload: { destination: "Для оформления социальной карты", copies: 1, comment: "" }, staffComment: null, createdAt: msk(2026, 11, 7, 18, 30) },
  ];
  for (const r of requests) {
    await db.request.create({ data: { ...r, updatedAt: r.createdAt } });
  }

  // Объявления
  await db.announcement.createMany({
    data: [
      { authorId: staffFitUser.id, title: "Запись на выбор темы ВКР", body: "Студенты 3 курса ФИТ: до 10 декабря заполните анкету выбора темы и руководителя ВКР. Список тем — у кураторов групп.", facultyId: fit.id, course: 3, publishedAt: msk(2026, 11, 5, 10, 0) },
      { authorId: staffFitUser.id, title: "График зимней сессии опубликован", body: "Экзамены пройдут с 11 по 29 января. Расписание консультаций появится в кабинете за неделю до сессии.", facultyId: fit.id, publishedAt: msk(2026, 11, 6, 12, 0) },
      { authorId: staffEfUser.id, title: "Посвящение в студенты", body: "14 ноября в 18:00 — посвящение для первокурсников экономического факультета. Актовый зал корпуса А.", facultyId: ef.id, course: 1, publishedAt: msk(2026, 11, 2, 9, 0) },
      { authorId: staffEfUser.id, title: "Неделя открытых библиотек", body: "С 16 по 20 ноября библиотека работает до 21:00. Приходите готовиться к контрольным!", publishedAt: msk(2026, 11, 7, 9, 0) },
    ],
  });

  // Уведомления
  await db.notification.createMany({
    data: [
      { userId: dima.user.id, type: "REQUEST_STATUS", title: "Справка об обучении: готова", body: "Заберите в ауд. Г-112 (пн–пт, 10:00–16:00).", link: "/requests", createdAt: msk(2026, 11, 5, 14, 0) },
      { userId: dima.user.id, type: "DEADLINE", title: "Через 5 дней: лабораторная №4 по базам данных", body: "Срок сдачи — 13 ноября, 23:59.", createdAt: msk(2026, 11, 8, 9, 0) },
      { userId: timur.user.id, type: "REQUEST_STATUS", title: "Выписка оценок: отклонена", body: "Есть академическая задолженность. Подробности — в заявке.", link: "/requests", createdAt: msk(2026, 11, 3, 10, 0) },
      { userId: anna.user.id, type: "ANNOUNCEMENT", title: "Посвящение в студенты — 14 ноября", body: "Актовый зал корпуса А, 18:00.", createdAt: msk(2026, 11, 2, 9, 0) },
    ],
  });

  console.log("\nГотово. Демо-аккаунты (пароль у всех одинаковый):");
  console.log("  Студент, ФИТ, 3 курс:   dima.sokolov");
  console.log("  Студент, ФИТ, 3 курс:   timur.kim");
  console.log("  Студентка, ЭФ, 1 курс:  anna.belova");
  console.log("  Деканат ФИТ:            dekanat.fit");
  console.log("  Деканат ЭФ:             dekanat.ef");
  console.log(process.env.SEED_DEMO_PASSWORD ? "  Пароль: из SEED_DEMO_PASSWORD" : `  Пароль: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
