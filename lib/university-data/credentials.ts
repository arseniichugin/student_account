/**
 * Логины и пароли, которые выдаёт импорт. Пароли в открытом виде существуют только
 * в памяти процесса импорта и в файле credentials.csv (он в .gitignore и .dockerignore).
 * В базу попадает только хеш argon2id, в консоль пароли не выводятся.
 */
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { CsvSyntaxError, parseCsv, toCsv } from "./csv";

/** Без похожих символов: нет 0/O/o, 1/l/I/i. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 12): string {
  // Гарантируем хотя бы одну строчную, одну заглавную букву и одну цифру.
  for (;;) {
    let p = "";
    for (let i = 0; i < length; i++) p += ALPHABET[randomInt(ALPHABET.length)];
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) return p;
  }
}

export const CREDENTIAL_HEADERS = ["Логин", "ФИО", "Email", "Роль", "Пароль"] as const;

export type CredentialRow = { login: string; fullName: string; email: string; role: string; password: string };

export const ROLE_STAFF = "Деканат";
export const ROLE_TEST_STUDENT = "Студент (тестовый)";
export const ROLE_STUDENT = "Студент";

const ROLE_ORDER = [ROLE_STAFF, ROLE_TEST_STUDENT, ROLE_STUDENT];

/** Читает прежний credentials.csv, чтобы повторный импорт не потерял выданные ранее пароли. */
export function readCredentials(path: string): Map<string, CredentialRow> {
  const rows = new Map<string, CredentialRow>();
  if (!existsSync(path)) return rows;
  const table = parseCsv(readFileSync(path, "utf8"));
  const idx = CREDENTIAL_HEADERS.map((h) => table.headers.indexOf(h));
  if (idx.some((i) => i < 0)) return rows;
  for (const r of table.records) {
    const [login, fullName, email, role, password] = idx.map((i) => r.values[i] ?? "");
    if (login && password) rows.set(login!, { login: login!, fullName: fullName!, email: email!, role: role!, password: password! });
  }
  return rows;
}

export function credentialsCsv(rows: Iterable<CredentialRow>): string {
  const sorted = [...rows].sort((a, b) => {
    const ra = ROLE_ORDER.indexOf(a.role);
    const rb = ROLE_ORDER.indexOf(b.role);
    return ra !== rb ? ra - rb : a.login.localeCompare(b.login);
  });
  return toCsv([...CREDENTIAL_HEADERS], sorted.map((r) => [r.login, r.fullName, r.email, r.role, r.password]));
}

/**
 * Файл пишется в два шага: сначала временный (до фиксации транзакции), затем
 * переименование. Если загрузка в базу не удалась — временный файл удаляется,
 * а прежний credentials.csv остаётся нетронутым.
 */
export function writeCredentialsTemp(path: string, rows: Iterable<CredentialRow>): string {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, credentialsCsv(rows), { encoding: "utf8", mode: 0o600 });
  return tmp;
}

export function commitCredentials(tmp: string, path: string) {
  renameSync(tmp, path);
}

export function discardCredentials(tmp: string) {
  try {
    unlinkSync(tmp);
  } catch {
    // файла могло и не быть
  }
}

export type CredentialsRecovery = {
  /** Строк из .tmp, перенесённых в основной файл (их пароли действуют в базе) */
  recovered: number;
  /** Строк из .tmp, чей пароль не подошёл к базе (транзакция того импорта не зафиксирована) */
  skipped: number;
  /** Файл .tmp не читается — переименован сюда, чтобы его можно было разобрать вручную */
  brokenFile?: string;
};

/**
 * Восстановление после сбоя прошлого импорта. Файл паролей пишется так: временный .tmp
 * внутри транзакции → фиксация транзакции → переименование. Если процесс оборвался между
 * фиксацией и переименованием, новые пароли уже действуют в базе, но лежат только в .tmp.
 *
 * Поэтому при старте импорта, если .tmp существует, он объединяется с основным файлом.
 * Строка из .tmp берётся, только если её пароль подходит к хешу в базе (verify): если сбой
 * случился ДО фиксации, пароли из .tmp недействительны и основной файл они не испортят.
 * Возвращает null, если .tmp нет.
 */
export async function recoverCredentialsTemp(
  path: string,
  verify: (login: string, password: string) => Promise<boolean>,
): Promise<CredentialsRecovery | null> {
  const tmp = `${path}.tmp`;
  if (!existsSync(tmp)) return null;

  let pending: Map<string, CredentialRow>;
  try {
    pending = readCredentials(tmp);
  } catch (e) {
    if (!(e instanceof CsvSyntaxError)) throw e;
    const brokenFile = `${tmp}.broken-${Date.now()}`;
    renameSync(tmp, brokenFile);
    return { recovered: 0, skipped: 0, brokenFile };
  }

  const main = readCredentials(path);
  const rows = [...pending.values()];
  const result: CredentialsRecovery = { recovered: 0, skipped: 0 };
  // argon2 работает в пуле потоков — проверяем пачками
  for (let i = 0; i < rows.length; i += 16) {
    const part = rows.slice(i, i + 16);
    const ok = await Promise.all(part.map((r) => (main.get(r.login)?.password === r.password ? true : verify(r.login, r.password))));
    part.forEach((row, j) => {
      if (!ok[j]) {
        result.skipped++;
        return;
      }
      if (main.get(row.login)?.password !== row.password) result.recovered++;
      main.set(row.login, row);
    });
  }

  // Основной файл — тоже через временный, чтобы сбой посреди записи его не испортил
  const merged = `${path}.recover`;
  writeFileSync(merged, credentialsCsv(main.values()), { encoding: "utf8", mode: 0o600 });
  renameSync(merged, path);
  unlinkSync(tmp);
  return result;
}
