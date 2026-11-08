#!/usr/bin/env bash
# Запуск кабинета при каждом открытии Codespace: сначала подтягиваем свежую версию из GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."

# Codespaces открывает сайт по адресу *.app.github.dev, а сервер видит localhost:3000.
# Без этой переменной Next.js отклоняет отправку форм (вход!) как поддельный запрос (CSRF)
# и показывает «This page couldn't load». Задаём её здесь, при запуске, — так она точно
# дойдёт до сервера (через containerEnv в Codespaces с Docker Compose она не доходила).
export SERVER_ACTIONS_ALLOWED_ORIGINS="${SERVER_ACTIONS_ALLOWED_ORIGINS:-*.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}}"

# Обновляемся, только если вы ничего не меняли в файлах сами — чтобы не потерять ваши правки.
if [ -z "$(git status --porcelain)" ]; then
  echo "▶ Проверяю обновления на GitHub"
  git pull --ff-only --quiet || echo "⚠ Не удалось скачать обновления — запускаю текущую версию."
else
  echo "⚠ В файлах есть ваши изменения — автообновление пропущено."
fi

bash .devcontainer/sync.sh

echo ""
echo "=================================================================="
echo " Кабинет запускается на порту 3000 (версия $(git log -1 --format='%h от %cd' --date=format:'%d.%m %H:%M'))."
echo " Если вкладка не открылась сама: вкладка PORTS внизу → строка 3000 →"
echo " значок глобуса (Open in Browser)."
echo " Логины: dima.sokolov, anna.belova, timur.kim, dekanat.fit, dekanat.ef"
echo " Пароль:  Gorizont2026"
echo " Обновить без перезапуска Codespace: Ctrl+C здесь, затем"
echo "   bash .devcontainer/start.sh"
echo "=================================================================="
echo ""
exec npm start
