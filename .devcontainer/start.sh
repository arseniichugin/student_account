#!/usr/bin/env bash
# Запуск кабинета при открытии Codespace.
set -euo pipefail

# Если сборки ещё нет (например, setup.sh прервали), собираем.
[ -f .next/BUILD_ID ] || npm run build

echo ""
echo "=================================================================="
echo " Кабинет запускается на порту 3000."
echo " Если вкладка не открылась сама: вкладка PORTS внизу → строка 3000 →"
echo " значок глобуса (Open in Browser)."
echo " Логины: dima.sokolov, anna.belova, timur.kim, dekanat.fit, dekanat.ef"
echo " Пароль:  Gorizont2026"
echo "=================================================================="
echo ""
exec npm start
