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

export type TeacherContext = {
  readonly userId: string;
  readonly teacherId: string;
  readonly [brand]: "TeacherContext";
};

/** Получатель уведомлений: студент или преподаватель (только userId из сессии). */
export type RecipientContext = {
  readonly userId: string;
  readonly role: "STUDENT" | "TEACHER";
  readonly [brand]: "RecipientContext";
};

/** Любой вошедший пользователь — студент, сотрудник деканата или преподаватель. */
export type UserContext = {
  readonly userId: string;
  readonly role: "STUDENT" | "STAFF" | "TEACHER";
  /** Факультет студента или сотрудника — например, для фильтра по умолчанию в поиске расписания. */
  readonly facultyId: string | null;
  readonly [brand]: "UserContext";
};

/** Страница или действие только для студента. Иначе — на вход или в кабинет сотрудника. */
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

/** Страница или действие только для преподавателя. */
export const requireTeacher = cache(async (): Promise<TeacherContext> => {
  const ctx = await getTeacherContext();
  if (ctx) return ctx;
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.role !== "TEACHER") redirect(HOME[session.user.role]);
  redirect("/login");
});

/** То же, что requireTeacher, но без редиректа (для API): null, если не вошли или вошли не преподавателем. */
export const getTeacherContext = cache(async (): Promise<TeacherContext | null> => {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "TEACHER") return null;
  const teacher = await db.teacher.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  if (!teacher) return null;
  return { userId: session.user.id, teacherId: teacher.id } as TeacherContext;
});

/** Страница уведомлений: студент или преподаватель. Сотрудника — в его кабинет. */
export const requireRecipient = cache(async (): Promise<RecipientContext> => {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.role === "STUDENT") {
    const s = await requireStudent();
    return { userId: s.userId, role: "STUDENT" } as RecipientContext;
  }
  if (session.user.role === "TEACHER") {
    const t = await requireTeacher();
    return { userId: t.userId, role: "TEACHER" } as RecipientContext;
  }
  redirect(HOME[session.user.role]);
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
  if (!user || (!user.student && !user.staff && !user.teacher)) return null;

  return {
    userId: session.user.id,
    role: session.user.role,
    facultyId: user.student?.facultyId ?? user.staff?.facultyId ?? null,
  } as UserContext;
});

/**
 * То же, что requireStaff, но без редиректа: null, если не вошли или вошли не сотрудником.
 * Для обработчиков API сотрудника (app/api/staff/*), которые отвечают 401/403, а не перенаправляют.
 */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "STAFF") return null;

  const staff = await db.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true, facultyId: true },
  });
  if (!staff) return null;

  return { userId: session.user.id, staffId: staff.id, facultyId: staff.facultyId } as StaffContext;
});
