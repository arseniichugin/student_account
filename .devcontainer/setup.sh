#!/usr/bin/env bash
# Подготовка Codespace: выполняется один раз при создании.
set -euo pipefail
bash "$(dirname "$0")/sync.sh"
echo "✅ Готово. Кабинет запустится автоматически во вкладке терминала «кабинет»."
