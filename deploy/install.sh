#!/usr/bin/env bash
# Установка dcm4chee с новым интерфейсом на Ubuntu / Debian.
#
#   sudo ./install.sh                         # всё целиком: архив + база + LDAP + интерфейс
#   sudo ./install.sh --ui-only --archive-url http://pacs.local:8080
#   sudo ./install.sh --install-runtime       # заодно поставить Docker (или Podman)
#
# Повторный запуск безопасен: существующий .env и данные не трогаются.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

MODE=full
ARCHIVE_URL_ARG=""
DATA_DIR_ARG=""
HOST_ARG=""
UI_PORT_ARG=""
INSTALL_RUNTIME=0
RUNTIME="${RUNTIME:-}"
OVERRIDES=()

usage() {
  cat <<EOF
Использование: $0 [параметры]

  --ui-only              только новый интерфейс к уже работающему dcm4chee
  --archive-url URL      адрес этого dcm4chee без пути, например http://pacs.local:8080
  --data-dir DIR         где хранить данные (по умолчанию /var/lib/dcm4chee)
  --host АДРЕС           адрес сервера для модальностей (по умолчанию — первый IP)
  --ui-port ПОРТ         порт интерфейса (по умолчанию 80)
  --runtime docker|podman
  --install-runtime      поставить Docker (или Podman при --runtime podman), если его нет
  --set КЛЮЧ=ЗНАЧЕНИЕ    задать любую настройку из .env, например --set DICOM_PORT=104
  -h, --help             эта справка
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ui-only) MODE=ui-only ;;
    --archive-url) ARCHIVE_URL_ARG="${2:?нужен адрес}"; shift ;;
    --data-dir) DATA_DIR_ARG="${2:?нужен каталог}"; shift ;;
    --host) HOST_ARG="${2:?нужен адрес}"; shift ;;
    --ui-port) UI_PORT_ARG="${2:?нужен порт}"; shift ;;
    --runtime) RUNTIME="${2:?docker или podman}"; shift ;;
    --install-runtime) INSTALL_RUNTIME=1 ;;
    --set)
      [[ "${2:-}" == *=* ]] || die "--set ждёт КЛЮЧ=ЗНАЧЕНИЕ"
      OVERRIDES+=("$2"); shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "неизвестный параметр: $1" ;;
  esac
  shift
done

if [ "$MODE" = ui-only ] && [ -z "$ARCHIVE_URL_ARG" ] && [ ! -f "$ENV_FILE" ]; then
  die "для --ui-only нужен --archive-url (адрес работающего dcm4chee)"
fi

check_os() {
  step "Система"
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian) ok "${PRETTY_NAME:-$ID}" ;;
      *) warn "${PRETTY_NAME:-$ID}: проверено на Ubuntu и Debian, здесь может потребоваться ручная настройка" ;;
    esac
  else
    warn "не удалось определить ОС — проверено на Ubuntu и Debian"
  fi
}

install_runtime() {
  [ "$(id -u)" -eq 0 ] || die "для установки ${RUNTIME:-docker} запустите через sudo"
  if [ "${RUNTIME:-docker}" = podman ]; then
    step "Ставим Podman"
    apt-get update -qq
    apt-get install -y -qq podman podman-compose >/dev/null
  else
    step "Ставим Docker (официальный скрипт get.docker.com)"
    command -v curl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl >/dev/null; }
    curl -fsSL https://get.docker.com | sh >/dev/null
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi
}

check_runtime() {
  step "Контейнеры"
  detect_runtime
  if [ -z "$RUNTIME" ] || ! "$RUNTIME" compose version >/dev/null 2>&1; then
    if [ "$INSTALL_RUNTIME" -eq 1 ]; then
      install_runtime
      detect_runtime
    fi
  fi
  [ -n "$RUNTIME" ] || die "нужен Docker с compose или Podman с compose. Запустите с --install-runtime или поставьте сами."
  ok "$RUNTIME: $("$RUNTIME" --version | head -1)"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

detect_host() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; fi
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
  fi
  echo "${ip:-127.0.0.1}"
}

# Значение ключа в .env: set_env KEY VALUE (заменяет строку KEY=...).
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" } $1 == k { print k, v; next } { print }' "$ENV_FILE" >"$tmp"
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
}

create_env() {
  step "Настройки"
  echo "$MODE" >"$MODE_FILE"
  if [ -f "$ENV_FILE" ]; then
    ok ".env уже есть — используем его (пароли и адреса не меняются)"
  else
    cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    set_env ARCHIVE_HOST "${HOST_ARG:-$(detect_host)}"
    for key in LDAP_ROOTPASS LDAP_CONFIGPASS POSTGRES_PASSWORD WILDFLY_ADMIN_PASSWORD; do
      set_env "$key" "$(random_secret)"
    done
    ok "создан .env со случайными паролями (доступен только владельцу)"
  fi
  if [ -n "$DATA_DIR_ARG" ]; then set_env DATA_DIR "$DATA_DIR_ARG"; fi
  if [ -n "$ARCHIVE_URL_ARG" ]; then set_env ARCHIVE_URL "${ARCHIVE_URL_ARG%/}"; fi
  if [ -n "$UI_PORT_ARG" ]; then set_env UI_PORT "$UI_PORT_ARG"; fi
  local pair
  for pair in "${OVERRIDES[@]+"${OVERRIDES[@]}"}"; do
    grep -q "^${pair%%=*}=" "$ENV_FILE" || die "в .env нет настройки ${pair%%=*}"
    set_env "${pair%%=*}" "${pair#*=}"
  done
  load_env

  # Podman без root не может занять порт ниже 1024.
  if [ "$RUNTIME" = podman ] && [ "$(id -u)" -ne 0 ] && [ "$UI_PORT" -lt 1024 ]; then
    warn "Podman без root не может занять порт $UI_PORT — интерфейс будет на 8000"
    set_env UI_PORT 8000
    load_env
  fi
  if [ "$HOST_ARG" = "" ] && [ "$ARCHIVE_HOST" = 127.0.0.1 ]; then
    warn "адрес сервера не определился — модальности его не увидят. Укажите --host или ARCHIVE_HOST в .env"
  fi
}

port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}\$"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

check_resources() {
  step "Ресурсы"
  # Порты проверяем только при первом запуске: работающий комплект занимает их сам.
  if [ -z "$(compose ps -q 2>/dev/null)" ]; then
    local ports=("$UI_PORT")
    [ "$MODE" = full ] && ports+=("$ARCHIVE_HTTP_PORT" "$DICOM_PORT" "$HL7_PORT")
    local busy=()
    for port in "${ports[@]}"; do port_busy "$port" && busy+=("$port"); done
    [ ${#busy[@]} -eq 0 ] || die "заняты порты: ${busy[*]}. Освободите их или поменяйте в $ENV_FILE"
    ok "порты свободны: ${ports[*]}"
  fi

  [ "$MODE" = full ] || return 0
  if [ -r /proc/meminfo ]; then
    local mem_gb
    mem_gb=$(awk '/MemTotal/ {printf "%d", $2 / 1024 / 1024}' /proc/meminfo)
    if [ "$mem_gb" -lt 4 ]; then warn "памяти ${mem_gb} ГБ — архиву нужно хотя бы 4"; else ok "память: ${mem_gb} ГБ"; fi
  fi

  mkdir -p "$DATA_DIR" 2>/dev/null || die "не удалось создать $DATA_DIR — запустите через sudo или укажите --data-dir"
  [ -w "$DATA_DIR" ] || die "нет прав на запись в $DATA_DIR — запустите через sudo или укажите --data-dir"
  local free_gb
  free_gb=$(df -Pk "$DATA_DIR" | awk 'NR == 2 {printf "%d", $4 / 1024 / 1024}')
  if [ "$free_gb" -lt 20 ]; then warn "в $DATA_DIR свободно ${free_gb} ГБ — снимкам этого мало"; else ok "место в $DATA_DIR: ${free_gb} ГБ"; fi
  mkdir -p "$DATA_DIR"/{ldap,slapd.d,db,wildfly,storage}
}

prepare_images() {
  step "Образы"
  local archive
  for archive in "$DEPLOY_DIR"/images/*.tar "$DEPLOY_DIR"/images/*.tar.gz; do
    [ -f "$archive" ] || continue
    info "загружаем из офлайн-пакета: $(basename "$archive")"
    "$RUNTIME" load -i "$archive" >/dev/null
  done

  if ! "$RUNTIME" image inspect "localhost/dcm4chee-ui:${UI_VERSION}" >/dev/null 2>&1; then
    [ -f "$DEPLOY_DIR/../web/Dockerfile" ] || die "нет образа интерфейса и его исходников — нужен полный репозиторий или офлайн-пакет"
    info "собираем образ интерфейса (несколько минут)…"
    "$RUNTIME" build -q -t "localhost/dcm4chee-ui:${UI_VERSION}" "$DEPLOY_DIR/../web" >/dev/null
  fi
  ok "интерфейс: localhost/dcm4chee-ui:${UI_VERSION}"

  if [ "$MODE" = full ]; then
    # Качаем только недостающее: в закрытом контуре образы уже загружены из пакета, а сети нет.
    local image missing=()
    for image in "docker.io/dcm4che/slapd-dcm4chee:${LDAP_VERSION}" \
                 "docker.io/dcm4che/postgres-dcm4chee:${POSTGRES_VERSION}" \
                 "docker.io/dcm4che/dcm4chee-arc-psql:${ARC_VERSION}"; do
      "$RUNTIME" image inspect "$image" >/dev/null 2>&1 || missing+=("$image")
    done
    if [ ${#missing[@]} -gt 0 ]; then
      info "скачиваем образы архива…"
      for image in "${missing[@]}"; do
        "$RUNTIME" pull -q "$image" >/dev/null || die "не удалось скачать $image — нет сети? Для закрытого контура нужен офлайн-пакет"
      done
    fi
    ok "архив: dcm4chee-arc-psql:${ARC_VERSION}, LDAP ${LDAP_VERSION}, PostgreSQL ${POSTGRES_VERSION}"
  fi
}

start() {
  step "Запуск"
  local output
  output="$(compose up -d 2>&1)" || { printf '%s\n' "$output" >&2; die "контейнеры не запустились"; }
  info "первый старт архива — 1–3 минуты"
  wait_ready 900
  ok "всё отвечает"
}

summary() {
  local host="${ARCHIVE_HOST}"
  [ "$MODE" = ui-only ] && host="$(detect_host)"
  echo
  printf '%sГотово.%s\n\n' "$C_BOLD" "$C_OFF"
  printf '  Интерфейс        http://%s%s/\n' "$host" "$([ "$UI_PORT" = 80 ] || echo ":$UI_PORT")"
  if [ "$MODE" = full ]; then
    printf '  DICOM            AE Title DCM4CHEE, %s:%s\n' "$ARCHIVE_HOST" "$DICOM_PORT"
    printf '  DICOMweb         http://%s:%s/dcm4chee-arc/aets/DCM4CHEE/rs\n' "$ARCHIVE_HOST" "$ARCHIVE_HTTP_PORT"
    printf '  Штатный UI       http://%s:%s/dcm4chee-arc/ui2/\n' "$ARCHIVE_HOST" "$ARCHIVE_HTTP_PORT"
    printf '  Данные           %s\n' "$DATA_DIR"
  else
    printf '  Архив            %s\n' "$ARCHIVE_URL"
  fi
  printf '  Настройки        %s %s(пароли внутри)%s\n\n' "$ENV_FILE" "$C_DIM" "$C_OFF"
  printf '  Управление:      ./dcm4chee.sh status | logs | stop | start | backup | update\n\n'
}

check_os
check_runtime
create_env
check_resources
prepare_images
start
summary
