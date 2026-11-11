/**
 * Чистые функции экранов расписания (lib/schedule/*) и меню (lib/navigation.ts). База не нужна.
 */
import { describe, expect, it } from "vitest";
import { HOME, NAV, activeNavHref, isNavActive } from "@/lib/navigation";
import { moscowDateTime } from "@/lib/moscow-time";
import {
  dayTiming,
  endsInLabel,
  firstDayWithLessons,
  formatDayLong,
  formatDayShort,
  formatWeekRange,
  groupLessonsByDate,
  lessonsCountLabel,
  pairLabel,
  parseDateParam,
  parseIdParam,
  parseViewParam,
  startsInLabel,
} from "@/lib/schedule/dates";
import { scheduleHref, todayHref } from "@/lib/schedule/links";

const TODAY = "2026-11-10";

describe("Разбор ?date=", () => {
  it("правильная дата остаётся", () => {
    expect(parseDateParam("2026-11-04", TODAY)).toBe("2026-11-04");
    expect(parseDateParam(" 2026-11-04 ", TODAY)).toBe("2026-11-04");
  });

  it("пусто, мусор, несуществующая дата, далёкий год → сегодня", () => {
    for (const v of [undefined, "", "мусор", "2026-02-30", "2026-13-01", "20261104", "2026-11-4", "1999-12-31", "2100-01-01", "<script>"]) {
      expect(parseDateParam(v, TODAY)).toBe(TODAY);
    }
  });

  it("повторённый параметр — берётся первое значение", () => {
    expect(parseDateParam(["2026-11-05", "2026-11-06"], TODAY)).toBe("2026-11-05");
    expect(parseDateParam(["мусор", "2026-11-06"], TODAY)).toBe(TODAY);
  });

  it("вид: только day или week (по умолчанию)", () => {
    expect(parseViewParam("day")).toBe("day");
    expect(parseViewParam("week")).toBe("week");
    expect(parseViewParam(undefined)).toBe("week");
    expect(parseViewParam("month")).toBe("week");
  });

  it("id: пустой или длиннее 64 символов → null", () => {
    expect(parseIdParam("abc")).toBe("abc");
    expect(parseIdParam("  ")).toBeNull();
    expect(parseIdParam("x".repeat(65))).toBeNull();
    expect(parseIdParam(undefined)).toBeNull();
  });
});

describe("Подписи «через N мин»", () => {
  it("до часа — минуты, до трёх часов — часы и минуты, дальше — время начала", () => {
    expect(startsInLabel(1, "09:00")).toBe("через минуту");
    expect(startsInLabel(25, "09:00")).toBe("через 25 мин");
    expect(startsInLabel(60, "09:00")).toBe("через 1 ч");
    expect(startsInLabel(80, "12:55")).toBe("через 1 ч 20 мин");
    expect(startsInLabel(180, "12:55")).toBe("в 12:55");
  });

  it("до конца идущего занятия", () => {
    expect(endsInLabel(25)).toBe("ещё 25 мин");
    expect(endsInLabel(65)).toBe("ещё 1 ч 5 мин");
    expect(endsInLabel(1)).toBe("заканчивается");
  });
});

describe("Идёт сейчас / следующая пара (по Москве)", () => {
  const lessons = [
    { id: "a", date: TODAY, start: "09:00", end: "10:20", status: "normal" },
    { id: "b", date: TODAY, start: "10:35", end: "11:55", status: "cancelled" },
    { id: "c", date: TODAY, start: "12:55", end: "14:15", status: "moved" },
  ];

  it("во время первой пары: идёт «a», следующая — «c» (отменённая «b» пропущена)", () => {
    const t = dayTiming(lessons, moscowDateTime(TODAY, "09:55"));
    // До «c» ровно 3 часа — показываем время начала, а не «через 3 ч»
    expect(t).toEqual({ currentId: "a", currentLabel: "ещё 25 мин", nextId: "c", nextLabel: "в 12:55" });
  });

  it("за 25 минут до пары — «через 25 мин»", () => {
    const t = dayTiming(lessons, moscowDateTime(TODAY, "12:30"));
    expect(t.currentId).toBeNull();
    expect(t.nextId).toBe("c");
    expect(t.nextLabel).toBe("через 25 мин");
  });

  it("часовой пояс браузера/сервера не важен: момент задан в UTC", () => {
    const t = dayTiming(lessons, new Date("2026-11-10T06:10:00Z")); // 09:10 МСК
    expect(t.currentId).toBe("a");
  });

  it("после последней пары — ничего", () => {
    expect(dayTiming(lessons, moscowDateTime(TODAY, "18:00"))).toEqual({
      currentId: null,
      currentLabel: null,
      nextId: null,
      nextLabel: null,
    });
  });
});

describe("Группировка по дням", () => {
  const lessons = [
    { id: "1", date: "2026-11-09", status: "normal" },
    { id: "2", date: "2026-11-09", status: "normal" },
    { id: "3", date: "2026-11-11", status: "cancelled" },
    { id: "4", date: "2026-11-13", status: "normal" },
    { id: "5", date: "2026-12-01", status: "normal" }, // вне периода — отбрасывается
  ];

  it("все 7 дней недели по порядку, пустые дни — с пустым списком", () => {
    const days = groupLessonsByDate(lessons, "2026-11-09", "2026-11-15");
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(days.map((d) => d.lessons.map((l) => l.id))).toEqual([["1", "2"], [], ["3"], [], ["4"], [], []]);
  });

  it("ближайший день с парами: после даты и не только с отменёнными", () => {
    expect(firstDayWithLessons(lessons, "2026-11-09")).toBe("2026-11-13");
    expect(firstDayWithLessons(lessons, "2026-12-01")).toBeNull();
  });
});

describe("Подписи дат и счётчики", () => {
  it("даты по-русски, без сдвига дня из-за часового пояса", () => {
    expect(formatDayLong("2026-11-10")).toBe("вторник, 10 ноября");
    expect(formatDayShort("2026-11-09")).toBe("Пн, 9 ноября");
    expect(formatWeekRange("2026-11-09", "2026-11-15")).toMatch(/^9–15 ноября 2026/);
    expect(formatWeekRange("2026-11-30", "2026-12-06")).toMatch(/^30 ноября – 6 декабря 2026/);
    expect(formatWeekRange("2026-12-28", "2027-01-03")).toMatch(/^28 декабря 2026.* – 3 января 2027/);
  });

  it("склонение «занятие» и номер пары", () => {
    expect([1, 2, 5, 11, 21, 22].map(lessonsCountLabel)).toEqual([
      "1 занятие",
      "2 занятия",
      "5 занятий",
      "11 занятий",
      "21 занятие",
      "22 занятия",
    ]);
    expect(pairLabel(1, 1)).toBe("1-я пара");
    expect(pairLabel(1, 2)).toBe("1–2 пары");
    expect(pairLabel(null, null)).toBeNull();
  });
});

describe("Адреса", () => {
  it("расписание: цель, дата и вид (неделя — по умолчанию, в адрес не пишется)", () => {
    expect(scheduleHref({})).toBe("/schedule");
    expect(scheduleHref({ target: { type: "group", id: "g1" }, date: "2026-11-12", view: "day" })).toBe(
      "/schedule?group=g1&date=2026-11-12&view=day",
    );
    expect(scheduleHref({ target: { type: "teacher", id: "t 1" }, view: "week" })).toBe("/schedule?teacher=t+1");
  });

  it("«Сегодня»: сегодняшний день — без параметра", () => {
    expect(todayHref(TODAY, TODAY)).toBe("/today");
    expect(todayHref("2026-11-12", TODAY)).toBe("/today?date=2026-11-12");
  });
});

describe("Меню", () => {
  it("студент: 6 пунктов, сотрудник: 4, преподаватель: 4; расписание и карта — у всех", () => {
    expect(NAV.STUDENT.map((i) => i.href)).toEqual(["/today", "/schedule", "/grades", "/map", "/requests", "/profile"]);
    expect(NAV.STAFF.map((i) => i.href)).toEqual(["/staff", "/staff/grades", "/schedule", "/map"]);
    expect(NAV.TEACHER.map((i) => i.href)).toEqual(["/journal", "/schedule", "/map", "/teacher/profile"]);
    expect(HOME).toEqual({ STUDENT: "/today", STAFF: "/staff", TEACHER: "/journal" });
  });

  it("каждый раздел меню есть в matcher proxy.ts (без cookie — сразу на вход)", async () => {
    const { config } = await import("@/proxy");
    const sections = new Set(Object.values(NAV).flatMap((items) => items.map((i) => `/${i.href.split("/")[1]}/:path*`)));
    for (const s of sections) expect(config.matcher).toContain(s);
  });

  it("активный пункт — сам раздел и подстраницы, но не похожие адреса", () => {
    expect(isNavActive("/requests", "/requests/abc")).toBe(true);
    expect(isNavActive("/staff", "/staff")).toBe(true);
    expect(isNavActive("/map", "/mapping")).toBe(false);
  });

  it("деканат: на «Успеваемости» подсвечена только она, а не «Заявки» (/staff)", () => {
    expect(activeNavHref(NAV.STAFF, "/staff")).toBe("/staff");
    expect(activeNavHref(NAV.STAFF, "/staff/grades")).toBe("/staff/grades");
    expect(activeNavHref(NAV.STAFF, "/staff/grades/student/25%D0%A1%D0%9B0001")).toBe("/staff/grades");
    expect(activeNavHref(NAV.STAFF, "/login")).toBeNull();
  });
});
