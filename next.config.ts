import type { NextConfig } from "next";

// Content-Security-Policy — только в продакшене: в режиме разработки React и Next.js
// используют eval (стек ошибок сервера в браузере), строгая политика сломала бы dev.
// 'unsafe-inline' в script-src нужен встроенным скриптам Next.js (данные RSC) — без nonce
// это единственный вариант, совместимый со статическими заголовками. Внешних доменов нет:
// шрифт, скрипт и стили карты — свои (/campus-map/*). HSTS выставляет HTTPS-прокси, а не приложение.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const isProduction = process.env.NODE_ENV === "production";

// cacheComponents отключён намеренно: почти каждая страница кабинета зависит
// от того, кто вошёл, и кешировать на сервере тут нечего. Без него код проще
// и для людей, и для ИИ-ассистентов. Решение описано в docs/ARCHITECTURE.md.
const nextConfig: NextConfig = {
  // Для Docker собираем автономный сервер (см. Dockerfile).
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  // Дополнительные адреса, с которых можно отправлять формы (серверные действия).
  // Нужно только за чужим прокси, который подменяет адрес (GitHub Codespaces —
  // см. .devcontainer/devcontainer.json). На боевом сервере переменная не задаётся,
  // и действует строгая проверка: только тот же адрес (защита от CSRF).
  experimental: process.env.SERVER_ACTIONS_ALLOWED_ORIGINS
    ? { serverActions: { allowedOrigins: process.env.SERVER_ACTIONS_ALLOWED_ORIGINS.split(",") } }
    : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(isProduction ? [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
