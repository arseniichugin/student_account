/**
 * Выполняется один раз при запуске сервера Next.js. Проверяем базу: если новая версия кабинета
 * запущена без новых миграций, запросы к новым колонкам падают и кнопки «Сохранить» не работают —
 * пишем об этом в лог сразу и громко (docker compose logs app), а не ждём жалоб пользователей.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkHealth } = await import("@/lib/health");
  const health = await checkHealth();
  if (health.database !== "ok") {
    console.error("⚠ База данных недоступна — проверьте DATABASE_URL и что PostgreSQL запущен.");
  } else if (health.pendingMigrations.length > 0) {
    console.error(
      `⚠ В базе не применены миграции этой версии (${health.pendingMigrations.join(", ")}).\n` +
        "  Сохранение данных работать не будет. Примените их: docker compose run --rm migrate " +
        "(или npx prisma migrate deploy), затем перезапустите приложение.",
    );
  } else {
    console.log(`✓ База на месте, миграции применены (версия сборки: ${health.deployment ?? "—"}).`);
  }
}
