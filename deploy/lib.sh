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

# Адрес сервера, который увидят модальности. Порядок важен: мосты Docker/Podman (docker0, br-*,
# podman*, cni*, virbr*, veth*) — не адрес сервера, а `hostname -I` может назвать их первыми
# (пойман тестом в закрытом контуре: вместо адреса сервера определился 172.18.0.1).
#   1) источник маршрута по умолчанию;  2) первый глобальный IPv4 не на мосту;
#   3) первый из hostname -I;  4) 127.0.0.1.
detect_host() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
    if [ -z "$ip" ]; then
      ip="$(ip -4 -o addr show scope global 2>/dev/null |
        awk '$2 !~ /^(docker|br-|podman|cni|virbr|veth)/ { split($4, a, "/"); print a[1]; exit }')"
    fi
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  echo "${ip:-127.0.0.1}"
}

# Значение ключа в .env: set_env KEY VALUE (заменяет строку KEY=...).
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  # Значение — через окружение, а не awk -v: тот раскрывает обратные слэши в значении.
  K="$key" V="$value" awk 'BEGIN { FS = "=" } $1 == ENVIRON["K"] { print ENVIRON["K"] "=" ENVIRON["V"]; next } { print }' \
    "$ENV_FILE" >"$tmp"
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
}

# LDIF → записи по возрастанию глубины DN (число RDN), внутри уровня — в исходном порядке.
# DN в base64 (dn::, бывает при кириллице) раскодируется для подсчёта.
ldif_parents_first() {
  awk '
    BEGIN { RS = ""; ORS = "\n\n" }
    {
      dn = ""
      n = split($0, lines, "\n")
      for (i = 1; i <= n; i++) {
        if (lines[i] ~ /^dn:: /) { cmd = "printf %s \"" substr(lines[i], 6) "\" | base64 -d"; cmd | getline dn; close(cmd); break }
        if (lines[i] ~ /^dn: /) { dn = substr(lines[i], 5); break }
      }
      plain = dn
      gsub(/\\,/, "", plain)
      depth[NR] = gsub(/,/, ",", plain)
      record[NR] = $0
      if (depth[NR] > max) max = depth[NR]
    }
    END { for (d = 0; d <= max; d++) for (i = 1; i <= NR; i++) if (depth[i] == d) print record[i] }
  '
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
