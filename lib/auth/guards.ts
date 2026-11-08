import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";

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

/** Страница или действие только для студента. Иначе — на вход или в кабинет сотрудника. */
export const requireStudent = cache(async (): Promise<StudentContext> => {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/staff");

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
  if (session.user.role !== "STAFF") redirect("/");

  const staff = await db.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true, facultyId: true },
  });
  if (!staff) redirect("/login");

  return { userId: session.user.id, staffId: staff.id, facultyId: staff.facultyId } as StaffContext;
});
