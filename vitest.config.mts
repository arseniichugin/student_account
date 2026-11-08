import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // Пакет server-only запрещает импорт вне сервера Next.js; в тестах подменяем пустышкой.
      "server-only": path.join(root, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Тесты работают с одной базой — запускаем файлы последовательно.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
