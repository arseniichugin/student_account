import "server-only";
import { db } from "@/lib/db";

export type Health = {
  ok: boolean;
  database: "ok" | "unavailable";
  /** Миграции этой версии кабинета, которых нет в базе (нужно: docker compose run --rm migrate) */
  pendingMigrations: string[];
  /** Версия сборки (DEPLOYMENT_VERSION) — видно, какая версия реально запущена */
  deployment: string | null;
};

/** Состояние сервера: доступна ли база и применены ли все миграции этой версии. */
export async function checkHealth(): Promise<Health> {
  const expected = (process.env.EXPECTED_MIGRATIONS ?? "").split(",").filter(Boolean);
  const deployment = process.env.BUILD_VERSION || null;
  try {
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const applied = new Set(rows.map((r) => r.migration_name));
    const pendingMigrations = expected.filter((m) => !applied.has(m));
    return { ok: pendingMigrations.length === 0, database: "ok", pendingMigrations, deployment };
  } catch (e) {
    console.error("[health] база недоступна:", e instanceof Error ? e.message : e);
    return { ok: false, database: "unavailable", pendingMigrations: expected, deployment };
  }
}
