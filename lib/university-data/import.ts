/**
 * Загрузка проверенного набора данных вуза в базу.
 *
 * — Всё в одной транзакции: либо загрузилось всё, либо база осталась как была.
 * — Повторный импорт идемпотентен: студенты сопоставляются по «ID студента»,
 *   их заявки, оценки и пароли сохраняются; расписание заменяется целиком;
 *   группы, дисциплины, преподаватели, аудитории обновляются по ключу (id не меняются).
 * — Новым студентам выдаётся случайный пароль; тестовым аккаунтам и деканатам —
 *   пароль из DEMO_PASSWORD при каждом запуске. Пароли пишутся только в credentials.csv.
 * — Студент, переставший быть тестовым, получает новый случайный пароль: демо-пароль
 *   знают все посетители стенда.
 */
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "../auth/password";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { isoDateToDb, moscowDateTime } from "../moscow-time";
import {
  ROLE_STAFF,
  ROLE_STUDENT,
  ROLE_TEST_STUDENT,
  commitCredentials,
  discardCredentials,
  generatePassword,
  readCredentials,
  recoverCredentialsTemp,
  writeCredentialsTemp,
  type CredentialRow,
} from "./credentials";
import { pickTestStudents, staffLoginForFaculty, type StudentData, type UniversityDataset } from "./validate";

export const DEFAULT_DEMO_PASSWORD = "Hogwarts2026";

/** Вымышленные сотрудники деканатов; выбираются по номеру факультета — детерминированно. */
const STAFF_NAMES = [
  "Морозова Ольга Сергеевна",
  "Лебедев Игорь Павлович",
  "Захарова Нина Аркадьевна",
  "Белоусов Глеб Матвеевич",
  "Королёва Вера Андреевна",
  "Сафонов Артём Ильич",
  "Мельникова Таисия Романовна",
  "Ершов Савелий Петрович",
];
const STAFF_POSITION = "Специалист по учебной работе";

export class ImportError extends Error {}

export type ImportOptions = {
  demoPassword: string;
  /** Логины тестовых студентов; пусто — выбрать автоматически (pickTestStudents). */
  testLogins?: string[] | null;
  /** Куда записать логины и пароли; null — не записывать (в тестах). */
  credentialsPath: string | null;
  log?: (message: string) => void;
};

export type ImportSummary = {
  faculties: number;
  programs: number;
  groups: number;
  students: number;
  createdAccounts: number;
  removedStudents: number;
  staff: { login: string; fullName: string; faculty: string }[];
  testStudents: { login: string; fullName: string; faculty: string; course: number; group: string }[];
  teachers: number;
  buildings: number;
  rooms: number;
  disciplines: number;
  lessons: number;
  lessonGroups: number;
  credentialsPath: string | null;
  credentialsRows: number;
  /** Бывшие тестовые студенты, которым выдан новый случайный пароль */
  resetTestStudents: number;
  /** Что стоит проверить человеку: переиспользованные «ID студента», восстановленный файл паролей */
  warnings: string[];
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Хеширует пароли параллельно (argon2 работает в пуле потоков libuv). */
async function hashAll(passwords: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const part of chunks(passwords, 32)) out.push(...(await Promise.all(part.map((p) => hashPassword(p)))));
  return out;
}

const fio = (s: Pick<StudentData, "lastName" | "firstName" | "middleName">) =>
  [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ");

export async function importUniversityData(
  db: PrismaClient,
  data: UniversityDataset,
  options: ImportOptions,
): Promise<ImportSummary> {
  const log = options.log ?? (() => {});
  if (!options.demoPassword) throw new ImportError("Не задан пароль тестовых аккаунтов (DEMO_PASSWORD)");

  // ─── 1. Подготовка вне транзакции: ничего не меняет в базе ─────────
  const byLogin = new Map(data.students.map((s) => [s.login, s]));
  let testStudents: StudentData[];
  if (options.testLogins && options.testLogins.length > 0) {
    testStudents = options.testLogins.map((login) => {
      const s = byLogin.get(login.trim().toLowerCase());
      if (!s) throw new ImportError(`TEST_STUDENT_LOGINS: студента с логином «${login}» нет в students.csv`);
      return s;
    });
  } else {
    testStudents = pickTestStudents(data);
  }
  const testLogins = new Set(testStudents.map((s) => s.login));

  const warnings: string[] = [];

  // Прошлый импорт мог оборваться между фиксацией транзакции и переименованием файла паролей
  if (options.credentialsPath) {
    const recovery = await recoverCredentialsTemp(options.credentialsPath, async (login, password) => {
      const user = await db.user.findUnique({ where: { login }, select: { passwordHash: true } });
      return !!user && (await verifyPassword(user.passwordHash, password));
    });
    if (recovery?.brokenFile) {
      warnings.push(`Файл паролей прошлого импорта (${options.credentialsPath}.tmp) повреждён и переименован в ${recovery.brokenFile} — проверьте его вручную.`);
    } else if (recovery) {
      warnings.push(
        `Найден файл паролей незавершённого прошлого импорта (${options.credentialsPath}.tmp): ` +
          `перенесено в основной файл строк ${recovery.recovered}, отброшено недействительных ${recovery.skipped}.`,
      );
    }
  }

  const existing = await db.student.findMany({
    select: {
      id: true,
      externalId: true,
      userId: true,
      lastName: true,
      firstName: true,
      middleName: true,
      user: { select: { login: true, isDemo: true } },
    },
  });
  const existingByExt = new Map(existing.map((s) => [s.externalId, s]));
  const newStudents = data.students.filter((s) => !existingByExt.has(s.externalId));
  const keptStudents = data.students.filter((s) => existingByExt.has(s.externalId));
  const credentials = options.credentialsPath ? readCredentials(options.credentialsPath) : new Map<string, CredentialRow>();

  // «ID студента» тот же, а логин или ФИО другие — возможно, это уже другой человек.
  // Его входы на других устройствах закрываем, а человеку показываем предупреждение.
  const reassigned = keptStudents.flatMap((s) => {
    const old = existingByExt.get(s.externalId)!;
    const changed = [old.user.login !== s.login && "логин", fio(old) !== fio(s) && "ФИО"].filter(Boolean);
    if (changed.length === 0) return [];
    warnings.push(
      `ID студента «${s.externalId}»: изменились ${changed.join(" и ")} (логин «${old.user.login}» → «${s.login}») — ` +
        `сессии аккаунта закрыты, пароль прежний. Если это другой человек, выдайте ему новый пароль.`,
    );
    return [old.userId];
  });

  // Бывшие тестовые студенты: демо-пароль знают все посетители — выдаём новый случайный.
  // Флаг isDemo — из базы; строка с демо-паролем или ролью «тестовый» в credentials.csv ловит
  // аккаунты, с которых флаг сняли прежние версии импорта, не сменив пароль.
  const demoPasswords = new Set([options.demoPassword, DEFAULT_DEMO_PASSWORD]);
  const formerTest = keptStudents
    .filter((s) => !testLogins.has(s.login))
    .filter((s) => {
      const old = existingByExt.get(s.externalId)!;
      const row = credentials.get(old.user.login);
      return old.user.isDemo || (!!row && (row.role === ROLE_TEST_STUDENT || demoPasswords.has(row.password)));
    });

  log(
    `Хеширую пароли: новых аккаунтов ${newStudents.length}, тестовых и деканатов ${testStudents.length + data.faculties.length}` +
      (formerTest.length ? `, бывших тестовых ${formerTest.length}` : "") +
      "…",
  );
  const newPasswords = newStudents.map((s) => (testLogins.has(s.login) ? options.demoPassword : generatePassword()));
  const newHashes = await hashAll(newPasswords);
  const demoHashes = await hashAll([...testStudents, ...data.faculties].map(() => options.demoPassword));
  const testHash = new Map(testStudents.map((s, i) => [s.login, demoHashes[i]!]));
  const staffHash = data.faculties.map((_, i) => demoHashes[testStudents.length + i]!);
  const formerPasswords = formerTest.map(() => generatePassword());
  const formerHashes = await hashAll(formerPasswords);
  const facultyName = new Map(data.faculties.map((f) => [f.code, f.name]));
  let tmpCredentials: string | null = null;

  // ─── 2. Транзакция ───────────────────────────────────────────────
  const counts = { removedStudents: 0, lessonGroups: 0 };
  try {
    await db.$transaction(
      async (tx) => {
        // Факультеты и направления
        log("Факультеты, направления, группы…");
        const facultyId = new Map<string, string>();
        for (const f of data.faculties) {
          const row = await tx.faculty.upsert({
            where: { code: f.code },
            create: { code: f.code, name: f.name, sortOrder: f.sortOrder },
            update: { name: f.name, sortOrder: f.sortOrder },
            select: { id: true },
          });
          facultyId.set(f.code, row.id);
        }
        const programId = new Map<string, string>();
        for (const p of data.programs) {
          const fid = facultyId.get(p.facultyCode)!;
          const row = await tx.program.upsert({
            where: { facultyId_name: { facultyId: fid, name: p.name } },
            create: { facultyId: fid, name: p.name },
            update: {},
            select: { id: true },
          });
          programId.set(`${p.facultyCode}\u0000${p.name}`, row.id);
        }

        // Группы: по названию; id существующих групп не меняются (на них ссылаются дедлайны и объявления)
        const oldGroups = new Map((await tx.group.findMany({ select: { id: true, name: true } })).map((g) => [g.name, g.id]));
        const groupId = new Map<string, string>();
        const groupFields = (g: (typeof data.groups)[number]) => ({
          kind: g.kind,
          oid: g.oid,
          course: g.course,
          facultyId: g.facultyCode ? (facultyId.get(g.facultyCode) ?? null) : null,
          parentId: null,
        });
        const createGroups = [];
        for (const g of data.groups) {
          const id = oldGroups.get(g.name);
          if (id) {
            await tx.group.update({ where: { id }, data: groupFields(g) });
            groupId.set(g.name, id);
          } else {
            const nid = randomUUID();
            createGroups.push({ id: nid, name: g.name, ...groupFields(g) });
            groupId.set(g.name, nid);
          }
        }
        if (createGroups.length) await tx.group.createMany({ data: createGroups });
        const childrenByParent = new Map<string, string[]>();
        for (const g of data.groups) {
          if (g.parentName && groupId.has(g.parentName)) {
            childrenByParent.set(g.parentName, [...(childrenByParent.get(g.parentName) ?? []), groupId.get(g.name)!]);
          }
        }
        for (const [parent, ids] of childrenByParent) {
          await tx.group.updateMany({ where: { id: { in: ids } }, data: { parentId: groupId.get(parent)! } });
        }

        // Дисциплины: по названию (на них ссылаются оценки и дедлайны)
        await tx.discipline.createMany({
          data: data.disciplines.map((d) => ({ name: d.name, oid: d.oid })),
          skipDuplicates: true,
        });
        const disciplineId = new Map(
          (await tx.discipline.findMany({ select: { id: true, name: true } })).map((d) => [d.name, d.id]),
        );

        // Расписание заменяется целиком
        log("Расписание: преподаватели, корпуса, аудитории, занятия…");
        await tx.lesson.deleteMany();

        const oldBuildings = new Map((await tx.building.findMany({ select: { id: true, key: true } })).map((b) => [b.key, b.id]));
        const buildingId = new Map<string, string>();
        const newBuildings = [];
        const buildingFields = (b: (typeof data.buildings)[number]) => ({
          name: b.name,
          abbr: b.abbr,
          address: b.address,
          floors: b.floors,
          wings: b.wings ?? Prisma.DbNull,
          maxRoom: b.maxRoom,
          scheme: b.scheme,
          onMap: b.onMap,
        });
        // Сначала убираем исчезнувшие корпуса (освобождаем уникальные названия), потом обновляем и создаём.
        await tx.building.deleteMany({ where: { key: { notIn: data.buildings.map((b) => b.key) } } });
        for (const b of data.buildings) {
          const id = oldBuildings.get(b.key);
          if (id) {
            await tx.building.update({ where: { id }, data: buildingFields(b) });
            buildingId.set(b.key, id);
          } else {
            const nid = randomUUID();
            buildingId.set(b.key, nid);
            newBuildings.push({ id: nid, key: b.key, ...buildingFields(b) });
          }
        }
        if (newBuildings.length) await tx.building.createMany({ data: newBuildings });

        const oldRooms = new Map((await tx.room.findMany({ select: { id: true, number: true } })).map((r) => [r.number, r.id]));
        await tx.room.deleteMany({ where: { number: { notIn: data.rooms.map((r) => r.number) } } });
        const roomId = new Map<string, string>();
        const newRooms = [];
        for (const r of data.rooms) {
          const fields = {
            buildingId: r.buildingKey ? (buildingId.get(r.buildingKey) ?? null) : null,
            type: r.type,
            capacity: r.capacity,
            floor: r.floor,
            wing: r.wing,
            purpose: r.purpose,
            bookable: r.bookable,
            onMap: r.onMap,
          };
          const id = oldRooms.get(r.number);
          if (id) {
            await tx.room.update({ where: { id }, data: fields });
            roomId.set(r.number, id);
          } else {
            const nid = randomUUID();
            roomId.set(r.number, nid);
            newRooms.push({ id: nid, number: r.number, ...fields });
          }
        }
        if (newRooms.length) await tx.room.createMany({ data: newRooms });

        const oldTeachers = new Map((await tx.teacher.findMany({ select: { id: true, oid: true } })).map((t) => [t.oid, t.id]));
        await tx.teacher.deleteMany({ where: { oid: { notIn: data.teachers.map((t) => t.oid) } } });
        const teacherId = new Map<string, string>();
        const newTeachers = [];
        for (const t of data.teachers) {
          const fields = { shortName: t.shortName, fullName: t.fullName, rank: t.rank, email: t.email };
          const id = oldTeachers.get(t.oid);
          if (id) {
            await tx.teacher.update({ where: { id }, data: fields });
            teacherId.set(t.oid, id);
          } else {
            const nid = randomUUID();
            teacherId.set(t.oid, nid);
            newTeachers.push({ id: nid, oid: t.oid, ...fields });
          }
        }
        if (newTeachers.length) await tx.teacher.createMany({ data: newTeachers });

        const lessonRows = [];
        const lessonGroupRows = [];
        for (const l of data.lessons) {
          const id = randomUUID();
          const date = isoDateToDb(l.date);
          lessonRows.push({
            id,
            oid: l.oid,
            date,
            startTime: l.startTime,
            endTime: l.endTime,
            startsAt: moscowDateTime(l.date, l.startTime),
            endsAt: moscowDateTime(l.date, l.endTime),
            pairStart: l.pairStart,
            pairEnd: l.pairEnd,
            disciplineId: disciplineId.get(l.discipline)!,
            kind: l.kind,
            teacherId: l.teacherOid ? (teacherId.get(l.teacherOid) ?? null) : null,
            roomId: l.room ? (roomId.get(l.room) ?? null) : null,
            buildingId: l.buildingKey ? (buildingId.get(l.buildingKey) ?? null) : null,
            stream: l.stream,
            subGroup: l.subGroup,
            note: l.note,
            url: l.url,
            urlDescription: l.urlDescription,
            status: l.status,
          });
          for (const g of l.groups) lessonGroupRows.push({ lessonId: id, groupId: groupId.get(g)!, date });
        }
        for (const part of chunks(lessonRows, 2000)) await tx.lesson.createMany({ data: part });
        for (const part of chunks(lessonGroupRows, 5000)) await tx.lessonGroup.createMany({ data: part });
        counts.lessonGroups = lessonGroupRows.length;

        // Студенты
        log("Студенты и аккаунты…");
        const removed = await tx.user.deleteMany({
          where: {
            role: "STUDENT",
            OR: [{ student: { is: null } }, { student: { externalId: { notIn: data.students.map((s) => s.externalId) } } }],
          },
        });
        counts.removedStudents = removed.count;

        const studentFields = (s: StudentData) => ({
          lastName: s.lastName,
          firstName: s.firstName,
          middleName: s.middleName,
          email: s.email,
          recordBookNo: s.recordBookNo,
          course: s.course,
          facultyId: facultyId.get(s.facultyCode)!,
          programId: programId.get(`${s.facultyCode}\u0000${s.programName}`)!,
          academicGroupId: groupId.get(s.academicGroup)!,
        });
        // Логин, почта и зачётка уникальны. В новом файле они могут «переехать» от одного студента
        // к другому (например, тот же ID у другого человека), поэтому сначала даём временные значения.
        const kept = keptStudents.map((s) => ({ s, old: existingByExt.get(s.externalId)! }));
        const keptUserIds = kept.map((k) => k.old.userId);
        const keptIds = kept.map((k) => k.old.id);
        await tx.$executeRaw`UPDATE "User" SET "login" = '~import~' || "id" WHERE "id" = ANY(${keptUserIds})`;
        await tx.$executeRaw`UPDATE "Student" SET "email" = '~import~' || "id", "recordBookNo" = '~import~' || "id" WHERE "id" = ANY(${keptIds})`;
        const studentId = new Map<string, string>();
        const movedCredentials: CredentialRow[] = [];
        for (const { s, old } of kept) {
          await tx.user.update({ where: { id: old.userId }, data: { login: s.login } });
          await tx.student.update({ where: { id: old.id }, data: studentFields(s) });
          studentId.set(s.externalId, old.id);
          // Пароль в credentials.csv переезжает вместе с аккаунтом, если сменился логин или ФИО
          const row = credentials.get(old.user.login);
          if (row) movedCredentials.push({ ...row, login: s.login, fullName: fio(s), email: s.email });
        }
        for (const { old } of kept) credentials.delete(old.user.login);
        for (const row of movedCredentials) credentials.set(row.login, row);
        if (reassigned.length) await tx.session.deleteMany({ where: { userId: { in: reassigned } } });
        const newUsers = [];
        const newStudentRows = [];
        for (const [i, s] of newStudents.entries()) {
          const userId = randomUUID();
          const id = randomUUID();
          studentId.set(s.externalId, id);
          newUsers.push({ id: userId, login: s.login, passwordHash: newHashes[i]!, role: "STUDENT" as const });
          newStudentRows.push({ id, userId, externalId: s.externalId, ...studentFields(s) });
          if (!testLogins.has(s.login)) {
            credentials.set(s.login, { login: s.login, fullName: fio(s), email: s.email, role: ROLE_STUDENT, password: newPasswords[i]! });
          }
        }
        for (const part of chunks(newUsers, 1000)) await tx.user.createMany({ data: part });
        for (const part of chunks(newStudentRows, 1000)) await tx.student.createMany({ data: part });

        await tx.studentGroup.deleteMany();
        const memberships = data.students.flatMap((s) =>
          s.languageGroups.map((g, i) => ({ studentId: studentId.get(s.externalId)!, groupId: groupId.get(g)!, position: i + 1 })),
        );
        for (const part of chunks(memberships, 5000)) await tx.studentGroup.createMany({ data: part });

        // Бывшие тестовые студенты: новый случайный пароль, без пометки, сессии закрыты
        for (const [i, s] of formerTest.entries()) {
          const { userId } = existingByExt.get(s.externalId)!;
          await tx.user.update({ where: { id: userId }, data: { passwordHash: formerHashes[i]!, isDemo: false } });
          await tx.session.deleteMany({ where: { userId } });
          credentials.set(s.login, { login: s.login, fullName: fio(s), email: s.email, role: ROLE_STUDENT, password: formerPasswords[i]! });
        }
        // Тестовые студенты: известный пароль при каждом импорте
        await tx.user.updateMany({ where: { role: "STUDENT", isDemo: true }, data: { isDemo: false } });
        for (const s of testStudents) {
          await tx.user.update({ where: { login: s.login }, data: { passwordHash: testHash.get(s.login)!, isDemo: true } });
          credentials.set(s.login, { login: s.login, fullName: fio(s), email: s.email, role: ROLE_TEST_STUDENT, password: options.demoPassword });
        }
        // Строка «тестовый» без тестового аккаунта в базе — с недействительным демо-паролем: убираем
        for (const row of [...credentials.values()]) {
          if (row.role === ROLE_TEST_STUDENT && !testLogins.has(row.login)) credentials.delete(row.login);
        }

        // Удаляем то, чего больше нет в файлах
        log("Удаляю устаревшее, создаю аккаунты деканатов…");
        await tx.group.deleteMany({ where: { name: { notIn: data.groups.map((g) => g.name) } } });
        const facultyCodes = data.faculties.map((f) => f.code);
        await tx.user.deleteMany({ where: { role: "STAFF", staff: { faculty: { code: { notIn: facultyCodes } } } } });
        await tx.faculty.deleteMany({ where: { code: { notIn: facultyCodes } } });
        await tx.program.deleteMany({ where: { students: { none: {} } } });
        await tx.discipline.deleteMany({ where: { lessons: { none: {} }, grades: { none: {} }, deadlines: { none: {} } } });

        // Деканаты: по одному сотруднику на факультет, пароль — DEMO_PASSWORD
        for (const [i, f] of data.faculties.entries()) {
          const login = staffLoginForFaculty(f.code);
          const fullName = STAFF_NAMES[(f.sortOrder - 1) % STAFF_NAMES.length]!;
          const user = await tx.user.upsert({
            where: { login },
            create: { login, passwordHash: staffHash[i]!, role: "STAFF", isDemo: true },
            update: { passwordHash: staffHash[i]!, role: "STAFF", isDemo: true },
            select: { id: true },
          });
          await tx.staff.upsert({
            where: { userId: user.id },
            create: { userId: user.id, facultyId: facultyId.get(f.code)!, fullName, position: STAFF_POSITION },
            update: { facultyId: facultyId.get(f.code)!, fullName, position: STAFF_POSITION },
          });
          credentials.set(login, { login, fullName, email: "", role: ROLE_STAFF, password: options.demoPassword });
        }

        // В файле остаются только логины, которые есть в базе
        const logins = new Set((await tx.user.findMany({ select: { login: true } })).map((u) => u.login));
        for (const login of [...credentials.keys()]) if (!logins.has(login)) credentials.delete(login);

        if (options.credentialsPath) tmpCredentials = writeCredentialsTemp(options.credentialsPath, credentials.values());
      },
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );
  } catch (e) {
    if (tmpCredentials) discardCredentials(tmpCredentials);
    throw e;
  }
  if (tmpCredentials && options.credentialsPath) commitCredentials(tmpCredentials, options.credentialsPath);

  return {
    faculties: data.faculties.length,
    programs: data.programs.length,
    groups: data.groups.length,
    students: data.students.length,
    createdAccounts: newStudents.length,
    removedStudents: counts.removedStudents,
    staff: data.faculties.map((f) => ({
      login: staffLoginForFaculty(f.code),
      fullName: STAFF_NAMES[(f.sortOrder - 1) % STAFF_NAMES.length]!,
      faculty: f.name,
    })),
    testStudents: testStudents.map((s) => ({
      login: s.login,
      fullName: fio(s),
      faculty: facultyName.get(s.facultyCode) ?? s.facultyCode,
      course: s.course,
      group: s.academicGroup,
    })),
    teachers: data.teachers.length,
    buildings: data.buildings.length,
    rooms: data.rooms.length,
    disciplines: data.disciplines.length,
    lessons: data.lessons.length,
    lessonGroups: counts.lessonGroups,
    credentialsPath: options.credentialsPath,
    credentialsRows: options.credentialsPath ? credentials.size : 0,
    resetTestStudents: formerTest.length,
    warnings,
  };
}
