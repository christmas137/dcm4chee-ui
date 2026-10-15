#!/usr/bin/env bash
# Офлайн-пакет для закрытого контура: образы архива и интерфейса + скрипты одним архивом.
# Собирается на машине с интернетом и Docker, ставится на сервер без интернета.
#
#   ./package-offline.sh                  # для x86_64-серверов
#   ./package-offline.sh --arch arm64     # для ARM-серверов
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

ARCH=amd64
while [ $# -gt 0 ]; do
  case "$1" in
    --arch) ARCH="${2:?amd64 или arm64}"; shift ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "неизвестный параметр: $1" ;;
  esac
  shift
done
case "$ARCH" in amd64|arm64) ;; *) die "архитектура: amd64 или arm64" ;; esac
PLATFORM="linux/$ARCH"

RUNTIME=docker
command -v docker >/dev/null 2>&1 || die "для сборки пакета нужен Docker"

# Версии — из шаблона, а не из локального .env: пакет должен быть одинаковым у всех.
set -a
# shellcheck disable=SC1091
. "$DEPLOY_DIR/.env.example"
set +a

NAME="dcm4chee-offline-${ARC_VERSION}-${ARCH}"
OUT="$DEPLOY_DIR/../dist"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT" "$STAGE/dcm4chee-offline/deploy/images"

IMAGES=(
  "docker.io/dcm4che/slapd-dcm4chee:${LDAP_VERSION}"
  "docker.io/dcm4che/postgres-dcm4chee:${POSTGRES_VERSION}"
  "docker.io/dcm4che/dcm4chee-arc-psql:${ARC_VERSION}"
)
UI_IMAGE="localhost/dcm4chee-ui:${UI_VERSION}"

step "Образы архива для $PLATFORM"
for image in "${IMAGES[@]}"; do
  docker pull -q --platform "$PLATFORM" "$image" >/dev/null
  ok "$image"
done

step "Образ интерфейса для $PLATFORM"
docker buildx build -q --platform "$PLATFORM" --load -t "$UI_IMAGE" "$DEPLOY_DIR/../web" >/dev/null
ok "$UI_IMAGE"

step "Сохраняем образы"
docker save --platform "$PLATFORM" -o "$STAGE/dcm4chee-offline/deploy/images/dcm4chee-images.tar" "${IMAGES[@]}" "$UI_IMAGE"
ok "$(du -h "$STAGE/dcm4chee-offline/deploy/images/dcm4chee-images.tar" | cut -f1)"

step "Собираем пакет"
cp "$DEPLOY_DIR"/{install.sh,dcm4chee.sh,lib.sh,compose.yaml,compose.ui-only.yaml,.env.example,README.md} \
  "$STAGE/dcm4chee-offline/deploy/"
tar -C "$STAGE" -czf "$OUT/$NAME.tar.gz" dcm4chee-offline
ok "$OUT/$NAME.tar.gz ($(du -h "$OUT/$NAME.tar.gz" | cut -f1))"
