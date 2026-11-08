#!/usr/bin/env bash
# Запуск кабинета при каждом открытии Codespace: сначала подтягиваем свежую версию из GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."

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
