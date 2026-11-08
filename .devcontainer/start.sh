#!/usr/bin/env bash
# Запуск кабинета при каждом открытии Codespace: сначала подтягиваем свежую версию из GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."

# Прокси Codespaces передаёт серверу публичный адрес *.app.github.dev, а заголовок Origin
# (откуда отправлена форма) подменяет на localhost:3000. Next.js видит несовпадение и отклоняет
# отправку форм (вход!) как поддельный запрос (CSRF) — «This page couldn't load».
# Разрешаем оба адреса. Задаём здесь, при запуске, — так переменная точно дойдёт до сервера.
export SERVER_ACTIONS_ALLOWED_ORIGINS="${SERVER_ACTIONS_ALLOWED_ORIGINS:-*.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev},localhost:3000}"

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
echo " Формы принимаются с адресов: $SERVER_ACTIONS_ALLOWED_ORIGINS"
echo " Логины: dima.sokolov, anna.belova, timur.kim, dekanat.fit, dekanat.ef"
echo " Пароль:  Gorizont2026"
echo " Обновить без перезапуска Codespace: Ctrl+C здесь, затем"
echo "   bash .devcontainer/start.sh"
echo "=================================================================="
echo ""
# Если кабинет уже запущен (например, в другом терминале), останавливаем старый сервер —
# иначе новый не сможет занять порт 3000 (ошибка EADDRINUSE).
if pkill -f "next-server|\.bin/next start" 2>/dev/null; then
  echo "▶ Остановлен ранее запущенный сервер"
  sleep 1
fi

exec npm start
