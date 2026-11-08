import "server-only";
import { createPrismaClient } from "@/lib/prisma-client";

type Client = ReturnType<typeof createPrismaClient>;

// Один клиент на процесс. В режиме разработки Next.js перезагружает модули,
// поэтому клиент кладётся в globalThis, чтобы не плодить подключения к базе.
const globalForPrisma = globalThis as unknown as { prisma?: Client };

function getClient(): Client {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Клиент создаётся лениво — при первом обращении к базе, а не при загрузке модуля.
// Иначе сборка (`next build`) падает там, где DATABASE_URL ещё не задан, например в Docker.
export const db = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
