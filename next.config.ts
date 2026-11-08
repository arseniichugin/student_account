import type { NextConfig } from "next";

// cacheComponents отключён намеренно: почти каждая страница кабинета зависит
// от того, кто вошёл, и кешировать на сервере тут нечего. Без него код проще
// и для людей, и для ИИ-ассистентов. Решение описано в docs/ARCHITECTURE.md.
const nextConfig: NextConfig = {
  // Для Docker собираем автономный сервер (см. Dockerfile).
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
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
        ],
      },
    ];
  },
};

export default nextConfig;
