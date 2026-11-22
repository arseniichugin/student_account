import { z } from "zod";

/**
 * POST /api/client-log — браузер сообщает, что не загрузился файл интерфейса или страница не «ожила»
 * (встроенный сторож в app/layout.tsx). Пишем одну строку в лог сервера: так администратор видит,
 * какие файлы /_next/static не отдаются (docker compose logs app | grep client).
 * Без входа (сбой бывает и на странице входа). Никаких данных пользователя — только тип, адрес файла и путь.
 */
const schema = z.object({
  type: z.enum(["script-error", "hydration-timeout"]),
  src: z.string().max(300).default(""),
  path: z.string().max(200).default(""),
});

// Не даём заспамить лог: не больше 60 строк в минуту на процесс
let windowStart = 0;
let count = 0;

export async function POST(request: Request) {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    count = 0;
  }
  if (++count > 60) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = JSON.parse((await request.text()).slice(0, 1000));
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    // Только свой адрес: путь файла без домена и параметров, без управляющих символов
    const clean = (v: string) => v.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/[^\w./\-[\]()%@]/g, "");
    console.warn(`[client] ${parsed.data.type} ${clean(parsed.data.src) || "-"} на странице ${clean(parsed.data.path) || "/"}`);
  }
  return new Response(null, { status: 204 });
}
