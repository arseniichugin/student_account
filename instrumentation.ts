/**
 * Выполняется один раз при запуске сервера Next.js. Проверяем базу: если новая версия кабинета
 * запущена без новых миграций, запросы к новым колонкам падают и кнопки «Сохранить» не работают —
 * пишем об этом в лог сразу и громко (docker compose logs app), а не ждём жалоб пользователей.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkHealth } = await import("@/lib/health");
  const health = await checkHealth();
  if (process.env.NODE_ENV !== "production" && !process.env.ALLOWED_DEV_ORIGINS) {
    console.warn(
      "⚠ Режим разработки (npm run dev): открывать кабинет можно только с http://localhost. " +
        "С другого адреса (IP сервера, домен) браузер не получит служебные файлы — кнопки и подсказки работать не будут.\n" +
        "  На сервере запускайте production: docker compose up -d app (или npm run build && npm start). " +
        "Если нужен именно режим разработки — задайте ALLOWED_DEV_ORIGINS=<IP или домен>.",
    );
  }
  if (health.database === "unavailable") {
    console.error("⚠ База данных недоступна — проверьте DATABASE_URL и что PostgreSQL запущен.");
  } else if (health.database === "empty") {
    console.error(
      "⚠ База данных пустая: в ней нет таблиц кабинета (вход и все страницы будут падать).\n" +
        "  Подготовьте её: npm run db:setup (миграции + данные вуза + демо-данные) " +
        "или в Docker: docker compose run --rm migrate. Проверьте и DATABASE_URL — та ли это база.",
    );
  } else if (health.pendingMigrations.length > 0) {
    console.error(
      `⚠ В базе не применены миграции этой версии (${health.pendingMigrations.join(", ")}).\n` +
        "  Сохранение данных работать не будет. Примените их: docker compose run --rm migrate " +
        "(без Docker — npx prisma migrate deploy), затем перезапустите приложение.",
    );
  } else {
    console.log(`✓ База на месте, миграции применены (версия сборки: ${health.deployment ?? "—"}).`);
  }
}
