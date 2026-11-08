#!/usr/bin/env bash
# Подготовка Codespace: выполняется один раз при создании.
set -euo pipefail

echo "▶ Настройки (.env)"
[ -f .env ] || cp .env.example .env

echo "▶ Зависимости"
npm ci

echo "▶ Ждём базу данных"
for i in $(seq 1 30); do
  node -e "require('net').connect(5432,'localhost').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" && break
  sleep 2
done

echo "▶ Таблицы и демо-данные"
npm run db:setup

echo "▶ Сборка"
npm run build

echo "✅ Готово. Кабинет запустится автоматически во вкладке терминала «кабинет»."
