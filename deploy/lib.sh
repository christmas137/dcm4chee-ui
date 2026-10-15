# Общие функции install.sh и dcm4chee.sh. Подключается через `source`, сам не запускается.
# shellcheck shell=bash

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
MODE_FILE="$DEPLOY_DIR/.mode"

# Цвета нужны и install.sh, и dcm4chee.sh — не каждая переменная используется в каждом.
# shellcheck disable=SC2034
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_OFF=$'\033[0m'
else
  C_BOLD=''; C_DIM=''; C_RED=''; C_YEL=''; C_GRN=''; C_OFF=''
fi

step() { printf '%s==>%s %s\n' "$C_BOLD" "$C_OFF" "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    %s✓%s %s\n' "$C_GRN" "$C_OFF" "$*"; }
warn() { printf '    %s!%s %s\n' "$C_YEL" "$C_OFF" "$*" >&2; }
die()  { printf '%sОшибка:%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }

# Docker или Podman: явный выбор через RUNTIME, иначе — что найдётся первым.
detect_runtime() {
  if [ -n "${RUNTIME:-}" ]; then
    command -v "$RUNTIME" >/dev/null 2>&1 || die "не найден $RUNTIME"
    return
  fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    RUNTIME=docker
  elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    RUNTIME=podman
  else
    RUNTIME=""
  fi
}

# Режим установки запоминается рядом с .env: full — всё целиком, ui-only — только интерфейс.
current_mode() {
  if [ -f "$MODE_FILE" ]; then cat "$MODE_FILE"; else echo full; fi
}

compose_file() {
  if [ "$(current_mode)" = ui-only ]; then
    echo "$DEPLOY_DIR/compose.ui-only.yaml"
  else
    echo "$DEPLOY_DIR/compose.yaml"
  fi
}

compose() {
  "$RUNTIME" compose --env-file "$ENV_FILE" -f "$(compose_file)" "$@"
}

# Значения из .env — в окружение скрипта.
load_env() {
  [ -f "$ENV_FILE" ] || die "нет $ENV_FILE — сначала запустите ./install.sh"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

# Готов ли интерфейс и отвечает ли через него архив.
ui_ready() {
  curl -sf -m 5 -o /dev/null "http://127.0.0.1:${UI_PORT}/healthz" &&
    curl -sf -m 5 -o /dev/null "http://127.0.0.1:${UI_PORT}/dcm4chee-arc/aets"
}

wait_ready() {
  local timeout="${1:-600}" waited=0
  while ! ui_ready; do
    if [ "$waited" -ge "$timeout" ]; then
      die "архив не ответил за $((timeout / 60)) мин. Логи: ./dcm4chee.sh logs arc"
    fi
    if [ $((waited % 30)) -eq 0 ] && [ "$waited" -gt 0 ]; then info "ждём архив… $waited с"; fi
    sleep 5
    waited=$((waited + 5))
  done
}
