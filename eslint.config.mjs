import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // «_ctx» — контекст из requireUser(): функция слоя данных требует вход, даже если сам контекст не читает.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Рабочие копии субагентов Claude Code и сгенерированный клиент Prisma
    ".claude/**",
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
