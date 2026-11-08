#!/usr/bin/env bash
# Приводит Codespace в соответствие с текущим кодом. Делает только то, что нужно:
#   зависимости — если изменился package-lock.json;
#   миграции   — всегда (если менять нечего, это мгновенно);
#   демо-данные — если изменились seed.ts или схема базы (данные сбрасываются к исходным);
#   сборка     — если код изменился с прошлой сборки.
set -euo pipefail
cd "$(dirname "$0")/.."

STATE=.devcontainer/.state
mkdir -p "$STATE"
fingerprint() { cat "$@" 2>/dev/null | sha256sum | cut -d' ' -f1; }
changed() { [ "$(cat "$STATE/$1" 2>/dev/null)" != "$2" ]; }

[ -f .env ] || cp .env.example .env

LOCK=$(fingerprint package-lock.json)
if changed lock "$LOCK" || [ ! -d node_modules ]; then
  echo "▶ Устанавливаю зависимости"
  npm ci
  echo "$LOCK" > "$STATE/lock"
fi

echo "▶ Жду базу данных"
for i in $(seq 1 30); do
  node -e "require('net').connect(5432,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" && break
  sleep 2
done

echo "▶ Применяю изменения схемы базы"
npx prisma migrate deploy >/dev/null

SEED=$(fingerprint prisma/seed.ts prisma/schema.prisma)
if changed seed "$SEED"; then
  echo "▶ Обновляю демо-данные"
  npm run db:seed
  echo "$SEED" > "$STATE/seed"
fi

CODE=$(git rev-parse HEAD 2>/dev/null || echo none)$(git status --porcelain 2>/dev/null | sha256sum | cut -c1-8)
if changed build "$CODE" || [ ! -f .next/BUILD_ID ]; then
  echo "▶ Собираю кабинет (около минуты)"
  npm run build
  echo "$CODE" > "$STATE/build"
fi
