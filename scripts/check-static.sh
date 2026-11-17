#!/usr/bin/env bash
# Проверка, что сервер стабильно отдаёт файлы интерфейса (/_next/static/…), на которые ссылается страница.
# Запуск на сервере или с любого компьютера:  bash scripts/check-static.sh https://ваш-домен [число-попыток]
# Если иногда приходит 404 — отвечают два экземпляра кабинета разных версий (или прокси кэширует старые страницы).
# Если иногда 502/000 — приложение перезапускается или прокси не достучался (docker compose logs app, ps).
set -u
BASE="${1:?Укажите адрес, например https://example.ru}"
N="${2:-20}"
bad=0; total=0; versions=""
for i in $(seq 1 "$N"); do
  html=$(curl -sk --max-time 15 "$BASE/login") || { echo "попытка $i: страница не загрузилась"; bad=$((bad+1)); continue; }
  # версия сборки — по имени одного из файлов (у разных сборок имена разные)
  first=$(printf '%s' "$html" | grep -o '/_next/static/[^"]*\.js[^"]*' | head -1)
  versions="$versions"$'\n'"$first"
  for u in $(printf '%s' "$html" | grep -o '/_next/static/[^"]*\.js[^"]*' | sort -u); do
    total=$((total+1))
    code=$(curl -sk -o /dev/null --max-time 15 -w "%{http_code}" "$BASE$u")
    if [ "$code" != "200" ]; then bad=$((bad+1)); echo "попытка $i: $code $u"; fi
  done
done
echo "Проверено файлов: $total, с ошибкой: $bad"
uniq=$(printf '%s\n' "$versions" | grep . | sort -u | wc -l)
echo "Разных версий страницы за $N попыток: $uniq (больше одной — запросы попадают на разные экземпляры кабинета)"
