import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { HOME } from "@/lib/navigation";

// «Контексты» — единственный способ сказать слою данных, ЧЬИ данные нужны.
// Они создаются только здесь, из проверенной сессии. Брендированный тип
// не даёт случайно собрать контекст вручную из id, пришедшего из адреса.
declare const brand: unique symbol;

export type StudentContext = {
  readonly userId: string;
  readonly studentId: string;
  readonly [brand]: "StudentContext";
};

export type StaffContext = {
  readonly userId: string;
  readonly staffId: string;
  readonly facultyId: string;
  readonly [brand]: "StaffContext";
};

/** Преподаватель (роль TEACHER): teacherId — запись Teacher, связанная с аккаунтом из сессии. */
export type TeacherContext = {
  readonly userId: string;
  readonly teacherId: string;
  readonly [brand]: "TeacherContext";
};

/** Любой вошедший пользователь — студент, сотрудник деканата или преподаватель. */
export type UserContext = {
  readonly userId: string;
  readonly role: "STUDENT" | "STAFF" | "TEACHER";
  /** Факультет студента или сотрудника — например, для фильтра по умолчанию в поиске расписания. У преподавателя — null. */
  readonly facultyId: string | null;
  readonly [brand]: "UserContext";
};

/** Страница или действие только для студента. Иначе — на вход или в кабинет своей роли. */
export const requireStudent = cache(async (): Promise<StudentContext> => {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.role !== "STUDENT") redirect(HOME[session.user.role]);

  const student = await db.student.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!student) redirect("/login");

  return { userId: session.user.id, studentId: student.id } as StudentContext;
});

/** Страница или действие только для сотрудника деканата. */
export const requireStaff = cache(async (): Promise<StaffContext> => {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.role !== "STAFF") redirect(HOME[session.user.role]);

  const staff = await db.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true, facultyId: true },
  });
  if (!staff) redirect("/login");

  return { userId: session.user.id, staffId: staff.id, facultyId: staff.facultyId } as StaffContext;
});

/** Страница или действие только для преподавателя (журнал оценок, профиль преподавателя). */
export const requireTeacher = cache(async (): Promise<TeacherContext> => {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.role !== "TEACHER") redirect(HOME[session.user.role]);

  const teacher = await db.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!teacher) redirect("/login");

  return { userId: session.user.id, teacherId: teacher.id } as TeacherContext;
});

/**
 * Страница или действие для любого вошедшего (студента, сотрудника или преподавателя):
 * например, расписание группы или преподавателя — это открытые данные вуза,
 * но без входа их не показываем. Без сессии — на страницу входа.
 */
export const requireUser = cache(async (): Promise<UserContext> => {
  const ctx = await getUserContext();
  if (!ctx) redirect("/login");
  return ctx;
});

/**
 * То же, что requireUser, но без редиректа: null, если не вошли.
 * Для обработчиков API (app/api/*), которые должны ответить 401, а не перенаправить на страницу входа.
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const session = await getCurrentSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      student: { select: { facultyId: true } },
      staff: { select: { facultyId: true } },
      teacher: { select: { id: true } },
    },
  });
  // Аккаунт без профиля своей роли (например, преподаватель исчез из расписания) — как без входа.
  const profile = { STUDENT: user?.student, STAFF: user?.staff, TEACHER: user?.teacher }[session.user.role];
  if (!user || !profile) return null;

  return {
    userId: session.user.id,
    role: session.user.role,
    facultyId: user.student?.facultyId ?? user.staff?.facultyId ?? null,
  } as UserContext;
});
