# Сборка в три шага: зависимости → сборка → компактный образ для запуска.

# 1. Зависимости
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# 2. Сборка. Этот же образ используется для миграций и наполнения базы
#    (docker compose run --rm migrate), потому что в нём есть Prisma CLI и tsx.
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && BUILD_STANDALONE=1 npm run build

# 3. Запуск: только собранный сервер, без исходников и dev-зависимостей.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Файлы вуза (карта читается с диска при запросе). На сервере папку обычно подключают томом
# из docker-compose.yml — тогда замена файлов не требует пересборки образа.
COPY --from=build --chown=app:app /app/data/university ./data/university
USER app
EXPOSE 3000
CMD ["node", "server.js"]
