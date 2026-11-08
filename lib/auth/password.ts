import { hash, verify } from "@node-rs/argon2";

// Алгоритм по умолчанию в @node-rs/argon2 — argon2id (рекомендация OWASP).
// Соль генерируется автоматически и хранится внутри строки хеша.

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Хеш случайной строки. Проверяется, когда логин не найден, чтобы ответ
// занимал столько же времени, сколько при неверном пароле: по времени ответа
// нельзя будет понять, существует ли такой логин.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hash(crypto.randomUUID());
  return dummyHash;
}
