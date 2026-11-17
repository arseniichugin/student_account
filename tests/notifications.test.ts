/**
 * События деканата и уведомления студентов (lib/data/notifications.ts):
 * кто получает, кто видит, отложенная отправка, отмена, права разных факультетов.
 * Нужна заполненная база: npm run db:setup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffContext, StudentContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  countMyUnreadNotifications,
  createFacultyAnnouncement,
  deleteFacultyAnnouncement,
  listFacultyAnnouncements,
  listMyNotifications,
  markMyNotificationsRead,
  suggestFacultyGroups,
} from "@/lib/data/notifications";
import { createAnnouncementSchema } from "@/lib/validation/notifications";

async function studentCtx(login: string): Promise<StudentContext> {
  const user = await db.user.findUniqueOrThrow({ where: { login }, include: { student: true } });
  return { userId: user.id, studentId: user.student!.id } as StudentContext;
}
async function staffCtxFor(facultyId: string): Promise<StaffContext> {
  const staff = await db.staff.findFirstOrThrow({ where: { facultyId } });
  return { userId: staff.userId, staffId: staff.id, facultyId } as StaffContext;
}

let studentA: StudentContext; // факультет A
let studentB: StudentContext; // факультет B
let staffA: StaffContext;
let staffB: StaffContext;
let facultyA: string;
let groupA: string; // академическая группа студента A
let groupB: string; // академическая группа студента B
const created: string[] = [];
const HOUR = 3_600_000;
// Строгий лимит демо-стенда (5 событий в час) тесту мешал бы: он сам создаёт несколько событий,
// а перед ним кто-то мог отправлять события из кабинета тем же деканатом.
const demoMode = process.env.DEMO_MODE;

beforeAll(async () => {
  delete process.env.DEMO_MODE;
  const demo = await db.student.findMany({
    where: { user: { isDemo: true } },
    orderBy: [{ faculty: { sortOrder: "asc" } }, { externalId: "asc" }],
    select: { facultyId: true, academicGroupId: true, user: { select: { login: true } } },
  });
  const a = demo[0]!;
  const b = demo.find((s) => s.facultyId !== a.facultyId)!;
  studentA = await studentCtx(a.user.login);
  studentB = await studentCtx(b.user.login);
  staffA = await staffCtxFor(a.facultyId);
  staffB = await staffCtxFor(b.facultyId);
  facultyA = a.facultyId;
  groupA = a.academicGroupId;
  groupB = b.academicGroupId;
});

afterAll(async () => {
  if (demoMode !== undefined) process.env.DEMO_MODE = demoMode;
  await db.announcement.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

async function send(ctx: StaffContext, input: Partial<Parameters<typeof createFacultyAnnouncement>[1]>, now?: Date) {
  const r = await createFacultyAnnouncement(
    ctx,
    { kind: "ANNOUNCEMENT", title: "Тест", body: "Текст", audience: { type: "faculty" }, sendAt: null, ...input },
    now,
  );
  if (r.ok) created.push(r.id);
  return r;
}

describe("Форма события (Zod)", () => {
  const base = { kind: "EXAM", title: "Экзамен", body: "Текст", audience: "faculty", when: "now" };
  it("всем — без курса и группы", () => {
    expect(createAnnouncementSchema.safeParse(base).success).toBe(true);
  });
  it("курсу — нужен курс, группе — нужна группа, «запланировать» — нужно время", () => {
    expect(createAnnouncementSchema.safeParse({ ...base, audience: "course", course: "" }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...base, audience: "course", course: "2" }).success).toBe(true);
    expect(createAnnouncementSchema.safeParse({ ...base, audience: "group", groupId: "" }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...base, when: "later", sendAt: "" }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...base, when: "later", sendAt: "2026-12-20T10:00" }).success).toBe(true);
  });
  it("статус заявки как вид события и слишком короткое название не принимаются", () => {
    expect(createAnnouncementSchema.safeParse({ ...base, kind: "REQUEST_STATUS" }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });
});

describe("События деканата: получатели и видимость", () => {
  it("«всем» — все студенты своего факультета; студент другого факультета не получает", async () => {
    const r = await send(staffA, { title: "Всем факультета A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recipients).toBe(await db.student.count({ where: { facultyId: facultyA } }));
    expect((await listMyNotifications(studentA)).some((n) => n.title === "Всем факультета A")).toBe(true);
    expect((await listMyNotifications(studentB)).some((n) => n.title === "Всем факультета A")).toBe(false);
  });

  it("«группе» — только студенты группы (академической или языковой)", async () => {
    const r = await send(staffA, { title: "Группе A", audience: { type: "group", groupId: groupA } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected = await db.student.count({
      where: { facultyId: facultyA, OR: [{ academicGroupId: groupA }, { languageGroups: { some: { groupId: groupA } } }] },
    });
    expect(r.recipients).toBe(expected);
    expect((await listMyNotifications(studentA)).some((n) => n.title === "Группе A")).toBe(true);
  });

  it("«курсу» — только студенты этого курса", async () => {
    const { course } = await db.student.findUniqueOrThrow({ where: { id: studentA.studentId }, select: { course: true } });
    const r = await send(staffA, { title: "Курсу", audience: { type: "course", course } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recipients).toBe(await db.student.count({ where: { facultyId: facultyA, course } }));
  });

  it("группе другого факультета отправить нельзя, и в подсказках её нет", async () => {
    const r = await send(staffA, { audience: { type: "group", groupId: groupB } });
    expect(r.ok).toBe(false);
    const groupName = (await db.group.findUniqueOrThrow({ where: { id: groupB } })).name;
    expect((await suggestFacultyGroups(staffA, groupName)).some((g) => g.id === groupB)).toBe(false);
    const own = await suggestFacultyGroups(staffA, "");
    expect(own.length).toBeGreaterThan(0);
    expect(own.length).toBeLessThanOrEqual(5);
  });

  it("отложенное событие не видно до времени отправки, потом появляется", async () => {
    const now = new Date();
    const r = await send(staffA, { title: "Отложенное", sendAt: new Date(now.getTime() + HOUR) }, now);
    expect(r.ok && r.scheduled).toBe(true);
    expect((await listMyNotifications(studentA, now)).some((n) => n.title === "Отложенное")).toBe(false);
    const later = new Date(now.getTime() + 2 * HOUR);
    expect((await listMyNotifications(studentA, later)).some((n) => n.title === "Отложенное")).toBe(true);
    // «Прочитать всё» сейчас не трогает ещё не пришедшее
    await markMyNotificationsRead(studentA, now);
    expect(await countMyUnreadNotifications(studentA, now)).toBe(0);
    expect(await countMyUnreadNotifications(studentA, later)).toBeGreaterThan(0);
    // В списке деканата — среди запланированных
    const list = await listFacultyAnnouncements(staffA, now);
    expect(list.find((a) => a.title === "Отложенное")?.scheduled).toBe(true);
  });

  it("время в прошлом и дальше 180 дней — отклоняются", async () => {
    const now = new Date();
    expect((await send(staffA, { sendAt: new Date(now.getTime() - 24 * HOUR) }, now)).ok).toBe(false);
    expect((await send(staffA, { sendAt: new Date(now.getTime() + 200 * 24 * HOUR) }, now)).ok).toBe(false);
  });

  it("чужой деканат не видит и не может отменить событие; свой — отменяет вместе с уведомлениями", async () => {
    const r = await send(staffA, { title: "Отменить" });
    if (!r.ok) throw new Error(r.error);
    expect((await listFacultyAnnouncements(staffB)).some((a) => a.id === r.id)).toBe(false);
    expect(await deleteFacultyAnnouncement(staffB, r.id)).toBe(false);
    expect(await db.notification.count({ where: { announcementId: r.id } })).toBeGreaterThan(0);
    expect(await deleteFacultyAnnouncement(staffA, r.id)).toBe(true);
    expect(await db.notification.count({ where: { announcementId: r.id } })).toBe(0);
  });

  it("студент видит только свои уведомления", async () => {
    const mine = await listMyNotifications(studentA);
    const foreign = await db.notification.count({ where: { id: { in: mine.map((n) => n.id) }, userId: { not: studentA.userId } } });
    expect(foreign).toBe(0);
  });
});
