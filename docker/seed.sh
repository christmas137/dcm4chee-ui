#!/usr/bin/env sh
# Создаёт venv рядом со скриптом и заливает тестовые данные в локальный архив.
set -e
dir=$(cd "$(dirname "$0")" && pwd)
if [ ! -d "$dir/.venv" ]; then
  python3 -m venv "$dir/.venv"
  "$dir/.venv/bin/pip" install -q --upgrade pip
  "$dir/.venv/bin/pip" install -q pydicom numpy
fi
exec "$dir/.venv/bin/python" "$dir/seed.py" "$@"
