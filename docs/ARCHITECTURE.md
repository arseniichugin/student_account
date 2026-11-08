# Архитектура

> Статус: **черновик**. Модель данных уточняется на этапе 2.

## 1. Общая схема

```
Браузер (телефон / ПК)
      │  HTTPS, cookie сессии (httpOnly, Secure, SameSite=Lax)
      ▼
Next.js (App Router)
  ├─ страницы и компоненты (React, Tailwind, shadcn/ui)
  ├─ Server Actions / Route Handlers  ← проверка сессии и прав
  └─ слой доступа к данным (lib/data/*) ← всегда фильтр по владельцу
      │
      ▼
PostgreSQL (через Prisma)

Внешние сервисы (опционально): YandexGPT / GigaChat — только с сервера
```

**Масштабирование:** приложение не хранит состояние в памяти (сессии — в базе),
поэтому можно запускать несколько копий за балансировщиком. База — одна, с резервными копиями.

## 2. Стек

| Слой | Технология | Зачем |
|---|---|---|
| Фреймворк | Next.js + TypeScript | Интерфейс и сервер в одном проекте |
| UI | Tailwind CSS, shadcn/ui, Lucide | Быстрый современный интерфейс, лицензии MIT/ISC |
| База | PostgreSQL 16 | Надёжная реляционная база |
| ORM | Prisma | Типобезопасные запросы, понятная схема |
| Валидация | Zod | Проверка всех входных данных на сервере |
| Пароли | argon2 (argon2id) | Современное хеширование |
| Развёртывание | Docker Compose на VPS | Простой и переносимый деплой |

## 3. Модель данных (черновик)

```
User            id, login, passwordHash, role (STUDENT | STAFF), createdAt
Session         id, userId, expiresAt                — хранится хеш токена
Faculty         id, name
Program         id, facultyId, name, code            — направление подготовки
Group           id, programId, name, course
Student         id, userId, groupId, lastName, firstName, middleName, recordBookNo
Staff           id, userId, facultyId, fullName, position
Teacher         id, fullName                         — вымышленные преподаватели
Subject         id, name
Lesson          id, groupId, subjectId, teacherId, type, room, startsAt, endsAt,
                status (NORMAL | MOVED | CANCELLED), originalStartsAt?, originalRoom?
Grade           id, studentId, subjectId, semester, kind (EXAM | CREDIT | COURSEWORK),
                value, date
Deadline        id, groupId, subjectId?, title, dueAt
RequestType     id, name, description, fields (JSON)
Request         id, studentId, typeId, payload (JSON),
                status (SUBMITTED | IN_PROGRESS | READY | ISSUED | REJECTED),
                staffComment?, createdAt, updatedAt
Announcement    id, authorId, title, body, audience (faculty / course / group), publishedAt
Notification    id, userId, type, title, body, link?, readAt?, createdAt
LoginAttempt    id, login, ip, success, createdAt   — для ограничения попыток
```

## 4. Безопасность

### 4.1 Вход
- Логин + пароль → проверка хеша **argon2id**.
- При успехе создаётся сессия: случайный токен в cookie `httpOnly; Secure; SameSite=Lax`,
  в базе хранится **хеш** токена и срок действия.
- Ограничение: не больше 5 неудачных попыток за 15 минут на логин/IP.
- Сообщение об ошибке одинаковое для неверного логина и неверного пароля.

### 4.2 Разграничение доступа
- Роль проверяется на сервере для каждой страницы и действия (`requireStudent()`, `requireStaff()`).
- **Студент:** все запросы к данным идут через функции из `lib/data/*`, которые принимают
  сессию и фильтруют по `studentId`/`userId`. Id из адреса используется только вместе с фильтром владельца.
- Если объект не принадлежит пользователю — ответ «Не найдено» (404), а не «Нет доступа»,
  чтобы не подтверждать существование чужой записи.
- **Сотрудник:** видит заявки и публикует объявления только в рамках своего факультета.

### 4.3 Секреты и данные
- Секреты (`DATABASE_URL`, `SESSION_SECRET`, ключи ИИ) — только в переменных окружения сервера.
- Никаких секретов в `NEXT_PUBLIC_*`, в коде и в репозитории. `.env` в `.gitignore`.
- Все входные данные валидируются Zod на сервере.
- Пароли и токены не пишутся в логи.
- Все данные — вымышленные, создаются seed-скриптом.

## 5. Структура проекта (план)

```
app/
  (auth)/login/          страница входа
  (student)/             кабинет студента: today, schedule, grades, requests, notifications, profile
  (staff)/               кабинет сотрудника
lib/
  auth/                  сессии, хеширование, requireStudent / requireStaff
  data/                  доступ к данным с проверкой владельца
  validation/            схемы Zod
components/              UI-компоненты
prisma/
  schema.prisma
  seed.ts                вымышленные данные
docs/                    документация проекта и для ИИ
```
