import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/** Создаёт клиент Prisma. В приложении используйте `db` из `lib/db.ts`. */
export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Не задана переменная окружения DATABASE_URL (см. .env.example)");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
