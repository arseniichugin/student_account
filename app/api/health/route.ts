import { getStaffContext } from "@/lib/auth/guards";
import { checkHealth } from "@/lib/health";

/**
 * GET /api/health — для мониторинга и администратора.
 * Без входа — только { ok } и код 200 / 503 (база недоступна или не применены миграции).
 * Подробности (какие миграции не применены, версия сборки) — только сотруднику деканата;
 * администратор сервера видит их и в логе при запуске (docker compose logs app).
 */
export async function GET() {
  const health = await checkHealth();
  const details = (await getStaffContext()) !== null;
  return Response.json(details ? health : { ok: health.ok }, {
    status: health.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
