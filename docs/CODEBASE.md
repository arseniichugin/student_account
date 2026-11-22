# Путеводитель по коду

> **Для кого:** для человека, который впервые открыл репозиторий, и для ИИ-ассистента (Claude и др.),
> которому нужно быстро понять, где что лежит и как правильно вносить изменения.
>
> **Как читать:** разделы независимы — можно перейти сразу к нужному. Каждый раздел отвечает на один вопрос.
> Пути к файлам указаны от корня репозитория. Правила, которые нарушать нельзя, — в [`CLAUDE.md`](../CLAUDE.md);
> здесь — устройство кода и готовые рецепты.
>
> **Актуально на:** 21 ноября 2026 (этап 3 — обязательное ядро; кабинет преподавателя, профили всех ролей).

## Содержание

1. [Проект за одну минуту](#1-проект-за-одну-минуту)
2. [Словарь](#2-словарь)
3. [Какой документ читать](#3-какой-документ-читать)
4. [Как проходит запрос](#4-как-проходит-запрос)
5. [Роли и контексты доступа](#5-роли-и-контексты-доступа)
6. [Карта страниц и API](#6-карта-страниц-и-api)
7. [Слой данных `lib/data/`](#7-слой-данных-libdata)
8. [Модель данных](#8-модель-данных)
9. [Данные вуза: импорт и демо-наполнение](#9-данные-вуза-импорт-и-демо-наполнение)
10. [Интерфейс: оболочка, компоненты, состояния](#10-интерфейс-оболочка-компоненты-состояния)
11. [Рецепты: как добавить…](#11-рецепты-как-добавить)
12. [Тесты и проверки](#12-тесты-и-проверки)
13. [Переменные окружения](#13-переменные-окружения)
14. [Частые ошибки и подводные камни](#14-частые-ошибки-и-подводные-камни)

---

## 1. Проект за одну минуту

| Вопрос | Ответ |
|---|---|
| Что это | Прототип личного кабинета студента для конкурса «Цифровой деканат будущего». Концепт, не официальный сервис |
| Вуз | Вымышленный «Хогвартс»: 4 факультета, 990 студентов, расписание на семестр. Все данные вымышлены |
| Роли | **Студент**, **сотрудник деканата** (`STAFF`, один на факультет), **преподаватель** (`TEACHER`) |
| Что умеет | Вход; «Сегодня»; расписание и поиск по группам/преподавателям; карта кампуса; оценки на занятиях; заявки на справки; уведомления (события деканата и преподавателя, отложенная отправка) |
| Стек | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 + Prisma 7 · Zod · argon2id · Vitest · Docker Compose |
| Главный принцип безопасности | Страница и действие сами проверяют сессию; запрос к базе получает **контекст из сессии**, а не id из адреса |
| Главный принцип данных | Вуз описан тремя заменяемыми файлами в `data/university/`; код не знает названий факультетов, групп и дисциплин |
| Дедлайн | Сдача — 22 ноября 2026, прототип должен работать до 28 ноября |

Быстрый старт (подробно — в [`README.md`](../README.md#-запуск-проекта)):

```bash
cp .env.example .env
```

```bash
docker compose up -d db
```

```bash
npm install && npm run db:setup && npm run dev
```

Вход: http://localhost:3000, логин `larisa.sharova26`, пароль `Hogwarts2026`.

## 2. Словарь

| Термин | Что значит в коде |
|---|---|
| **Контекст** (`StudentContext`, `StaffContext`, `TeacherContext`, `RecipientContext`, `UserContext`) | Объект «кто вошёл», созданный **только** в `lib/auth/guards.ts` из проверенной сессии. Брендированный тип: собрать вручную из id нельзя |
| **Guard** (`requireStudent()` и др.) | Функция в начале страницы/действия: проверяет сессию и роль, возвращает контекст или делает редирект |
| **Слой данных** | Модули `lib/data/*` — единственное место запросов к базе из страниц, действий и API |
| **Серверное действие** (Server Action) | Функция с `"use server"`, которую вызывает форма. Публичная точка входа — поэтому сама вызывает guard |
| **Занятие** (`Lesson`) | Одна пара из `schedule.csv`. Лекция потока — одно занятие, связанное с несколькими группами через `LessonGroup` |
| **Оценка на занятии** (`Mark`) | Оценка 1–5 за конкретное занятие; их может быть 0…N. Не путать с `Grade` — итоговой оценкой ведомости |
| **Заявка** (`Request`) | Заказ справки студентом; статусы `SUBMITTED → IN_PROGRESS → READY → ISSUED` или `REJECTED` |
| **Событие** (`Announcement`) | Рассылка деканата или преподавателя. При создании порождает `Notification` для каждого получателя |
| **Уведомление** (`Notification`) | Строка во «Входящих» конкретного пользователя. Видна, только когда `createdAt ≤ now` (отложенная отправка) |
| **Кружок «новое»** | Число на пункте меню: новые оценки и заявки с изменившимся статусом (`components/mark-seen.tsx`, `new-tag.tsx`) |
| **Демо-аккаунт** (`User.isDemo`) | Тестовый аккаунт для жюри; импорт каждый раз ставит ему пароль `DEMO_PASSWORD` |
| **Демо-режим** (`DEMO_MODE=1`) | Публичный стенд: опасные для общего аккаунта действия (смена пароля) отключены на сервере, лимиты ниже |
| **Московское время** | Все даты занятий — строки `YYYY-MM-DD` и `HH:MM` по Москве (`lib/moscow-time.ts`) |

## 3. Какой документ читать

| Задача | Читать |
|---|---|
| Любая работа с репозиторием | [`CLAUDE.md`](../CLAUDE.md) — жёсткие правила, стек, особенности версий |
| Понять устройство кода | этот файл |
| Что делаем и зачем, критерии готовности | [`docs/PRD.md`](PRD.md) |
| Сервер, база, вход, безопасность | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) |
| Интерфейс: цвета, компоненты, тексты | [`docs/DESIGN.md`](DESIGN.md) |
| Оценки на занятиях | [`docs/MARKS.md`](MARKS.md) |
| Уведомления и события | [`docs/NOTIFICATIONS.md`](NOTIFICATIONS.md) |
| Роль преподавателя | [`docs/TEACHERS.md`](TEACHERS.md) |
| Формат файлов вуза, замена вуза | [`data/university/README.md`](../data/university/README.md) |
| Docker, сервер, обновление версии | [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) |
| Что сделано и что дальше | [`docs/ROADMAP.md`](ROADMAP.md) |
| Как ставить задачи ИИ | [`docs/PROMPTS.md`](PROMPTS.md), субагенты — `.claude/agents/` |
| История решений и ошибок ИИ | [`docs/AI_LOG.md`](AI_LOG.md) |
| Next.js 16 API | `node_modules/next/dist/docs/` (см. [`AGENTS.md`](../AGENTS.md)) |

Если документы расходятся с кодом — **прав код** (`prisma/schema.prisma`, `lib/auth/guards.ts`, `lib/navigation.ts`).
Исправь документ в той же задаче.

## 4. Как проходит запрос

```
Браузер ── cookie «sid» (httpOnly, SameSite=Lax) ──►
  proxy.ts            нет cookie → редирект на /login (только скорость, НЕ защита; /api/* не трогает)
    │
  app/(app)/layout.tsx  requireUser() → оболочка AppShell: меню роли из lib/navigation.ts, колокольчик, кружки
    │
  страница page.tsx     requireStudent() / requireStaff() / requireTeacher() / requireRecipient() / requireUser()
    │                   → контекст
    ▼
  lib/data/*.ts         функция(ctx, …) — where всегда включает ctx.studentId / ctx.facultyId / группы преподавателя
    ▼
  PostgreSQL (Prisma, lib/db.ts — ленивый клиент)
```

Запись данных идёт через **серверное действие**:

```
<form> (клиентский компонент)
  → action в actions.ts / lib/*/form-actions.ts ("use server")
      1. ctx = await requireX()             — своя проверка, страница не защищает действие
      2. schema.safeParse(formData)         — Zod из lib/validation/*
      3. runAction(name, () => lib/data/…)  — ошибка в лог без данных людей + понятный текст в форму
      4. revalidatePath(...) / redirect(...)
```

API (`app/api/*/route.ts`) используют `get…Context()` вместо `require…()`: без сессии отвечают **401**,
а не редиректом. Ответы — с `Cache-Control: private, no-store`.

## 5. Роли и контексты доступа

Все guards — в `lib/auth/guards.ts`, обёрнуты в `React.cache` (повторный вызов в одном запросе бесплатен).

| Guard | Для API (без редиректа) | Кто проходит | Что в контексте | Чем ограничен доступ |
|---|---|---|---|---|
| `requireStudent()` | — | `STUDENT` | `userId`, `studentId` | только свои записи (`studentId`) |
| `requireStaff()` | `getStaffContext()` | `STAFF` | `userId`, `staffId`, `facultyId` | только свой факультет (`facultyId`) |
| `requireTeacher()` | `getTeacherContext()` | `TEACHER` | `userId`, `teacherId` | только группы, где он ведёт занятия (`teacherGroupIds`) |
| `requireRecipient()` | — | `STUDENT`, `TEACHER` | `userId`, `role` | свои уведомления (`userId`) |
| `requireUser()` | `getUserContext()` | любой вошедший | `userId`, `role`, `facultyId?` | открытые данные вуза (расписание, карта) |

**Профиль** есть у каждой роли (`PROFILE_HREF` в `lib/navigation.ts`): данные аккаунта, «О себе», смена пароля.
«О себе» (`User.about`, до 1000 символов, обычный текст) меняет только сам пользователь (`saveAboutAction` → `updateMyAbout(ctx: UserContext)`).
Демо-решение: тестовым аккаунтам «О себе» **разрешено** (жюри должно попробовать функцию), но с лимитом 5 в час,
подсказкой «текст увидят все посетители», и `npm run db:seed` возвращает их тексты к исходным. Смена пароля у тестовых аккаунтов и в `DEMO_MODE` — запрещена.

Чужая роль на странице → редирект на свою главную (`HOME` в `lib/navigation.ts`:
студент `/today`, деканат `/staff`, преподаватель `/schedule`). Нет сессии → `/login`.

Правило владельца (из `CLAUDE.md`):

```ts
// ❌ id из адреса без проверки владельца
db.request.findUnique({ where: { id } })
// ✅ ищем только среди своих
db.request.findFirst({ where: { id, studentId: ctx.studentId } })
```

Чужая запись должна выглядеть как **несуществующая** (`notFound()`), а не как «нет доступа».

## 6. Карта страниц и API

Меню каждой роли перечислено только в `lib/navigation.ts` (`NAV`). Группы маршрутов в скобках не попадают в адрес.

### Страницы

| Адрес | Файл | Guard | Данные (`lib/data/…`) | Подробнее |
|---|---|---|---|---|
| `/` | `app/page.tsx` | сессия | — | редирект на `HOME[role]` |
| `/login` | `app/(auth)/login/` | — | `lib/auth/actions.ts` | ARCHITECTURE §4.1 |
| `/today` | `app/(app)/(student)/today/` | `requireStudent` | schedule, schedule-moves, requests, profile | PRD §5.2 |
| `/grades` | `app/(app)/(student)/grades/` | `requireStudent` | marks | MARKS.md |
| `/requests`, `/requests/new`, `/requests/[id]` | `app/(app)/(student)/requests/` | `requireStudent` | requests | PRD §5.5 |
| `/profile` | `app/(app)/(student)/profile/` — данные, «О себе», смена пароля | `requireStudent` | profile, account | PRD §5.1 |
| `/staff` | `app/(app)/(staff)/staff/` | `requireStaff` | requests, profile | PRD §5.7 |
| `/staff/marks` | `app/(app)/(staff)/staff/marks/` — `?view=form` (курс → группа → студент → предмет → дата) или `?view=table` (журнал) | `requireStaff` | journal, marks | MARKS.md |
| `/staff/notifications` | `app/(app)/(staff)/staff/notifications/` | `requireStaff` | notifications | NOTIFICATIONS.md |
| `/staff/profile` | `app/(app)/(staff)/staff/profile/` — ФИО, должность, факультет, логин, «О себе», смена пароля | `requireStaff` | profile, account | §5 ниже |
| `/teacher/marks` | `app/(app)/(teacher)/teacher/marks/` — журнал (студенты × занятия, оценки и посещаемость; без клиентского JS) | `requireTeacher` | journal, marks, teacher | TEACHERS.md |
| `/teacher/notifications` | `app/(app)/(teacher)/teacher/notifications/` | `requireTeacher` | notifications, teacher | TEACHERS.md |
| `/teacher/profile` | `app/(app)/(teacher)/teacher/profile/` — ФИО, звание, дисциплины и группы, логин, «О себе», смена пароля | `requireTeacher` | teacher, account | TEACHERS.md |
| `/notifications` | `app/(app)/notifications/` | `requireRecipient` | notifications | NOTIFICATIONS.md |
| `/schedule` | `app/(app)/schedule/` (у `?teacher=` — «О преподавателе» из его «О себе») | `requireUser` (+ роль для «моего») | schedule, schedule-moves | DESIGN §6 |
| `/map` | `app/(app)/map/` | `requireUser` | файл `campus-map.json` | `lib/campus-map/` |

У каждого раздела есть `loading.tsx` (скелетон); общий `app/(app)/error.tsx` даёт кнопку «Повторить».
Layout-ы групп `(student)`, `(staff)`, `(teacher)` — дополнительный рубеж, **не замена** guard в странице.

### Серверные действия

| Файл | Действия | Guard |
|---|---|---|
| `lib/auth/actions.ts` | `loginAction`, `logoutAction`, `changePasswordAction` (любая роль; блокировка `getPasswordChangeLock`) | — / сессия |
| `lib/profile/actions.ts` | `saveAboutAction` — «О себе» (только своё: userId из сессии, в форме его нет) | `requireUser` |
| `app/(app)/(student)/requests/actions.ts` | `createRequestAction`, `markRequestsSeenAction` | `requireStudent` |
| `app/(app)/(student)/grades/actions.ts` | `markMarksSeenAction` | `requireStudent` |
| `app/(app)/(staff)/staff/actions.ts` | `updateStatusAction` — смена статуса заявки | `requireStaff` |
| `app/(app)/notifications/actions.ts` | `markNotificationsReadAction` | `requireRecipient` |
| `lib/notifications/form-actions.ts` | создать/удалить событие деканата и преподавателя | `requireStaff` / `requireTeacher` |
| `lib/journal/actions.ts` | `addJournalMarkAction`, `removeJournalMarkAction` (деканат **или** преподаватель), `setJournalAttendanceAction` (преподаватель) — обычные формы, `redirect` обратно, ошибка кодом `?msg=`, успех `?ok=1` | Grader / `requireTeacher` |

### API

| Маршрут | Контекст | Что возвращает |
|---|---|---|
| `GET /api/schedule/search?q=` | `getUserContext` | группы и преподаватели для поиска расписания (студентов не возвращает) |
| `GET /api/health` | без входа — только `ok`; деканату — подробности | состояние базы и миграций (`lib/health.ts`) |
| `POST /api/client-log` | — | браузер сообщает о незагрузившихся файлах → строка `[client] …` в логе |

## 7. Слой данных `lib/data/`

Каждая функция первым аргументом принимает контекст. Писать запрос к базе вне `lib/data/*` нельзя
(исключения — `lib/auth/*`, импорт `lib/university-data/*`, `prisma/seed.ts`, `lib/health.ts`).

| Модуль | Ключевые функции | Контекст |
|---|---|---|
| `requests.ts` | `listRequestTypes`, `listMyRequests`, `getMyRequest`, `createMyRequest`, `countMyChangedRequests`, `markMyRequestsSeen` · `listFacultyRequests`, `countFacultyRequestsByStatus`, `updateFacultyRequestStatus` | Student · Staff |
| `schedule.ts` | `getMyScheduleForDate`, `getMyScheduleForRange`, `myGroupIds` · `searchScheduleTargets`, `getGroupSchedule`, `getTeacherSchedule`, `listFaculties`, `listFacultyGroups`, `weekRange`, `checkRange` (≤ `MAX_RANGE_DAYS`) | Student · User |
| `schedule-moves.ts` | `getMyMovedAway`, `getGroupMovedAway`, `getTeacherMovedAway` — заглушки «Перенесено на …» | Student · User |
| `marks.ts` | `getMyMarksOverview`, `countMyNewMarks`, `markMyMarksSeen` · `suggestGradable*`, `createMark`, `listRecentMarks`, `deleteMark` (тип `Grader = StaffContext \| TeacherContext`) | Student · Grader |
| `notifications.ts` | `createFacultyAnnouncement`, `createTeacherAnnouncement`, `list…Announcements`, `delete…Announcement`, `suggest…`, счётчики аудитории · `listMyNotifications`, `countMyUnreadNotifications`, `markMyNotificationsRead` | Staff · Teacher · Recipient |
| `profile.ts` | `getMyStudentProfile`, `getMyStaffProfile` | Student · Staff |
| `teacher.ts` | `getMyTeacherProfile` | Teacher |
| `journal.ts` | `listTeacherClasses`, `getJournal` (деканат и преподаватель), `setTeacherAttendance` · `listFacultyGroupOptions`, `listGroupDisciplineOptions`, `listGroupStudentOptions` | Grader · Teacher · Staff |
| `account.ts` | `getPasswordChangeLock`, `changeMyPassword` · `getMyAbout`, `updateMyAbout` («О себе», лимит `MAX_ABOUT_EDITS_PER_HOUR[_DEMO]`) | userId из сессии · User |

Ограничения частоты (защита от спама) живут рядом с функциями записи:
`MAX_ACTIVE_REQUESTS`, `MAX_REQUESTS_PER_HOUR` (заявки), `MAX_MARKS_PER_HOUR[_DEMO]` (оценки),
`MAX_ANNOUNCEMENTS_PER_HOUR[_DEMO]`, `MAX_SCHEDULE_AHEAD_DAYS` (события), `MAX_ATTENDANCE_PER_HOUR[_DEMO]` (посещаемость),
`MAX_ABOUT_EDITS_PER_HOUR[_DEMO]` («О себе»: 20 в час; у тестовых аккаунтов и в `DEMO_MODE` — 5; журнал `AboutEdit`). Лимиты входа — `lib/auth/rate-limit.ts`.

Функции записи возвращают результат-объединение, а не бросают исключения:
`{ ok: true, id } | { ok: false, reason: "too-many-recent" | … }` — действие превращает `reason` в текст для формы.

Чистые функции без базы (удобно тестировать) — вне `lib/data/`:
`lib/marks/stats.ts`, `lib/schedule/*`, `lib/moscow-time.ts`, `lib/notifications/labels.ts`, `lib/requests/status.ts`, `lib/safe-url.ts`.

## 8. Модель данных

Источник истины — `prisma/schema.prisma` (с комментариями `///` к полям). Подробная таблица — `docs/ARCHITECTURE.md` §3.

```
                 ┌──── User (login, passwordHash, role, isDemo, about) ─────────┐
                 │                 │                    │                       │
              Student            Staff               Teacher               Session, Notification
   (facultyId, programId,   (facultyId — один    (oid из расписания;
    academicGroupId)         на факультет)        userId может быть null)
      │   │                       │                    │
      │   └─ StudentGroup ── Group (ACADEMIC | LANGUAGE | OTHER; parentId) ── Faculty, Program
      │                        │
      │                   LessonGroup ── Lesson (date, startTime, status) ── Discipline, Teacher, Room ── Building
      │                                     │
      ├── Mark (value 1–5, lessonOid, createdById → Staff | teacherId → Teacher)
      ├── Attendance (PRESENT | LATE | ABSENT, одна на студента и занятие, lessonOid, teacherId)
      ├── Grade (итог ведомости: EXAM | CREDIT | COURSEWORK | MIDTERM)
      └── Request (typeId → RequestType, status, payload JSON)

Announcement (author → User, audience, facultyId? / course? / groupId? / teacherId?, publishedAt)
   └── Notification (userId, type, readAt, createdAt = момент видимости)
Deadline (groupId, disciplineId?) · LoginAttempt (лимиты входа) · AboutEdit (userId, createdAt — лимит «О себе»)
```

Перечисления: `Role` (STUDENT | STAFF | TEACHER), `LessonStatus` (NORMAL | MOVED | CANCELLED | REPLACED),
`RequestStatus`, `GradeKind`, `GroupKind`, `AnnouncementAudience`, `NotificationType`.
В клиентских компонентах импортируй их из `@/lib/generated/prisma/enums`, на сервере — из `@/lib/generated/prisma/client`.

Миграции — `prisma/migrations/` (по одной на крупную функцию: init, данные вуза, оценки, уведомления, кружки, преподаватели, посещаемость, «О себе»).

## 9. Данные вуза: импорт и демо-наполнение

| Слой | Где | Что делает | Команда |
|---|---|---|---|
| Файлы вуза | `data/university/` (`students.csv`, `schedule.csv`, `campus-map.json`) | Заменяемое описание вуза. Формат — `data/university/README.md` | — |
| Генераторы | `tools/` (Python) | Создали синтетические файлы «Хогвартса». В образ не попадают | см. README в каждой папке |
| Импорт | `lib/university-data/` + `scripts/import-university-data.ts` | Проверяет **все** файлы (Zod + перекрёстные проверки), затем грузит **одной транзакцией**. Пишет `credentials.csv` (не коммитить) | `npm run data:import` (`-- --check`, `-- --dir <путь>`) |
| Демо-контент | `prisma/seed.ts` | Заявки, оценки, события, уведомления, дедлайны поверх импорта; берёт факультеты и группы из базы | `npm run db:seed` |
| Карта | `lib/campus-map/` | Страница `/map` читает `campus-map.json` на каждый запрос — файл меняется без пересборки | — |

Всё сразу: `npm run db:setup` (миграции → импорт → seed), с нуля: `npm run db:reset`.

## 10. Интерфейс: оболочка, компоненты, состояния

- **Оболочка** — `components/app-shell.tsx`: нижняя панель на телефоне, боковое меню на ≥ 1024 px,
  бейдж «Концепт для конкурса» (`components/concept-badge.tsx`) на каждой странице.
- **Базовые компоненты** — `components/ui/`: `Button`/`buttonVariants`, `Card`, поля формы (`Input`, `Select`, `Textarea`, `Label`, `FormMessage` — `form.tsx`),
  `Combobox` (подсказки до 5 вариантов), `EmptyState` и `Skeleton` (`states.tsx`), `RetryButton`, `DetailsList`.
- **Профиль** — `components/profile/`: `ProfileHeader`, `AboutCard` + `AboutForm` («О себе», `<details>` — работает без JS),
  `PasswordCard` (форма или объяснение блокировки), `ProfileSkeleton` (общий `loading.tsx` трёх профилей).
- **Предметные компоненты** — `components/schedule/`, `components/marks/`, `components/notifications/`,
  `components/campus-map/`, `status-badge.tsx`, `status-timeline.tsx`.
- **Три состояния** у каждого экрана с данными: загрузка (`loading.tsx` + скелетон), пусто (`EmptyState` с действием),
  ошибка (`error.tsx` с «Повторить»).
- **Цвета и размеры** — только токены из `app/globals.css` и `docs/DESIGN.md` (`bg-surface`, `text-muted`, `border-border`, `text-primary`…).
- **Сетки** начинаются с `grid-cols-1`; на 360 px не должно быть горизонтальной прокрутки.
- **Формы без JavaScript** тоже работают (прогрессивное улучшение): при отправке без JS сервер возвращает ту же страницу с ошибкой.
- `components/hydration-check.tsx` + `app/api/client-log` — диагностика «интерфейс загрузился не полностью».

## 11. Рецепты: как добавить…

### …новую страницу для роли

1. Создай `app/(app)/(student)/<раздел>/page.tsx` (или в `(staff)/staff/`, `(teacher)/teacher/`).
2. Первая строка компонента — `const ctx = await requireStudent();` (соответствующий guard).
3. Данные — через функцию из `lib/data/*` (новую — см. ниже).
4. Добавь `loading.tsx` со скелетоном и пустое состояние через `EmptyState`.
5. Пункт меню — в `NAV` в `lib/navigation.ts`; адрес — в `matcher` в `proxy.ts`.
6. Проверь на 360 px и ≥ 1024 px; запусти субагента `ui-reviewer`.

### …новый запрос к базе

1. Функция в `lib/data/<модуль>.ts`, файл начинается с `import "server-only";`.
2. Первый аргумент — контекст (`ctx: StudentContext` и т. п.), **не** голый id.
3. В `where` всегда условие владельца: `studentId: ctx.studentId`, `facultyId: ctx.facultyId`
   или `groupId: { in: await teacherGroupIds(ctx.teacherId) }`.
4. `select` только нужных полей (не отдавать `passwordHash` и лишние персональные данные).
5. Тест в `tests/`: «свои видны, чужие — нет». Запусти субагента `security-reviewer`.

### …форму с записью

1. Схема Zod — в `lib/validation/<модуль>.ts`.
2. Действие с `"use server"`: guard → `safeParse` → `runAction(...)` → функция `lib/data/*` → `revalidatePath`/`redirect`.
3. Клиентская форма: `useActionState`; если после сохранения поля должны показать новые значения —
   `onSubmit` + `startTransition(() => formAction(formData))` (образец — `app/(app)/(staff)/staff/status-form.tsx`).
4. Ограничь частоту записи (константа `MAX_…_PER_HOUR`), в `DEMO_MODE` — строже или отключи (`lib/config.ts`).

### …API для подсказок

1. `app/api/<путь>/route.ts`, `export async function GET(request: Request)`.
2. `const ctx = await get…Context(); if (!ctx) return Response.json({ error }, { status: 401 })`.
3. Параметры — через Zod; ответ — `≤ 5` записей, заголовок `Cache-Control: private, no-store`.
4. В `proxy.ts` API не добавлять.

### …поле в базу

1. Правка `prisma/schema.prisma` (с комментарием `///`).
2. `npm run db:migrate -- --name <имя>` → миграция в `prisma/migrations/`.
3. Если поле наполняется из файлов вуза — `lib/university-data/` + `data/university/README.md`; демо-данные — `prisma/seed.ts`.
4. Обнови `docs/ARCHITECTURE.md` §3 и профильный документ.

## 12. Тесты и проверки

Перед каждым коммитом:

```bash
npm run lint && npm run typecheck && npm test
```

- Тесты (`tests/*.test.ts`, Vitest) работают с **настоящей базой** — сначала `npm run db:setup`.
  Файлы идут последовательно (`fileParallelism: false`). `server-only` подменён заглушкой (`tests/stubs/`).
- Главные: `security.test.ts` (чужие данные, хеши, лимиты входа), `teachers.test.ts`, `journal.test.ts`, `marks.test.ts`,
  `notifications.test.ts`, `university-*.test.ts` (импорт на `tests/fixtures/`, в т. ч. сломанные файлы), `schedule*.test.ts`.
- Интерфейс — Playwright (уже установлен в облачном окружении): 360 px, вход под тестовым аккаунтом,
  скриншоты — в `docs/screenshots/` по правилам из README папки.
- Перед запуском продакшен-сервера останови старый процесс на порту 3000.
- После деплоя: `scripts/check-static.sh` и `GET /api/health`.

## 13. Переменные окружения

Полный список с комментариями — `.env.example`. Секреты — только в `.env` на сервере, никогда в `NEXT_PUBLIC_*`.

| Переменная | Зачем | По умолчанию |
|---|---|---|
| `DATABASE_URL` | подключение к PostgreSQL | — (обязательна) |
| `POSTGRES_PASSWORD` | пароль базы для `docker compose` | — |
| `DEMO_PASSWORD` | пароль тестовых аккаунтов | `Hogwarts2026` |
| `TEST_STUDENT_LOGINS`, `TEST_TEACHER_LOGINS` | какие аккаунты сделать тестовыми | выбирает импорт |
| `UNIVERSITY_NAME` | название вуза в интерфейсе | «Хогвартс» |
| `UNIVERSITY_DATA_DIR` | папка файлов вуза | `data/university` |
| `DEMO_MODE` | `1` — публичный стенд, опасные действия отключены | выключен |
| `COOKIE_SECURE` | `false` — только для проверки продакшен-сборки по http://localhost | — |
| `TRUST_PROXY` | `1` — только за своим Caddy/nginx с `X-Real-IP` | выключен |

`ALLOWED_DEV_ORIGINS` — только для `npm run dev` с адреса не `localhost` (IP, домен; через запятую). На сервере — production, см. `DEPLOYMENT.md` §7.

## 14. Частые ошибки и подводные камни

| Симптом / соблазн | Как правильно |
|---|---|
| Взять `id` из `params` и сразу искать запись | Искать с условием владельца из контекста; чужое → `notFound()` |
| Защитить страницу только layout-ом или скрытой кнопкой | Guard в каждой странице **и** в каждом серверном действии |
| `params.id` без `await` | В Next.js 16 `params`/`searchParams` — промисы: `const { id } = await params` |
| Создать `middleware.ts` | В Next.js 16 это `proxy.ts` (и он не защита) |
| Включить `cacheComponents` или `"use cache"` | Выключено намеренно — все страницы зависят от сессии |
| Настройки подключения в `schema.prisma` | В Prisma 7 — в `prisma.config.ts`; клиент — `@/lib/generated/prisma/client` (не коммитится) |
| `process.env.X` в клиентском компоненте | Пусто в браузере: читать на сервере (`lib/config.ts`) и передавать пропсом |
| Форма «сбрасывается» после сохранения | `<form action>` в React 19 сбрасывает поля; см. рецепт форм выше |
| Хардкод «Гриффиндор», «1-ГР», «Зельеварение» | Брать из базы — вуз заменяемый |
| `new Date()` для даты занятия | Даты — по Москве через `lib/moscow-time.ts` |
| Ссылка из данных в `href` | Через `safeExternalUrl` (`lib/safe-url.ts`) — только http(s) |
| `console.log` с паролем, токеном, ФИО | Не логировать; ошибки действий — через `runAction` |
| «Не сохраняется на сервере» после обновления | Не применены миграции: `docker compose run --rm migrate` (DEPLOYMENT.md §6–7), проверка — `/api/health` |
| Новая библиотека, шрифт, иконка | Объяснить зачем и записать в таблицу лицензий в `README.md` |

---

*Обновляй этот файл, когда добавляешь раздел, роль, модуль `lib/data/*` или меняешь поток запроса.
В конце задачи — запись в [`docs/AI_LOG.md`](AI_LOG.md).*
