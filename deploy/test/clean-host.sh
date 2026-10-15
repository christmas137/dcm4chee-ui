#!/usr/bin/env bash
# Проверка на «голом сервере»: одноразовая машина с systemd из официального образа дистрибутива,
# куда комплект ставится с нуля — как после git clone на настоящем сервере.
#
#   deploy/test/clean-host.sh ubuntu:24.04
#   deploy/test/clean-host.sh debian:12 --runtime podman
#   deploy/test/clean-host.sh ubuntu:24.04 --offline dist/dcm4chee-offline-5.35.2-arm64.tar.gz
#
# Внутри машины: install.sh --install-runtime (сам ставит Docker или Podman), затем
# дымовой тест (smoke.sh) — установка, приём снимков, поиск, копия и восстановление.
# Нужен Docker на машине, где запускается проверка.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DISTRO="${1:?укажите образ дистрибутива, например ubuntu:24.04}"
shift
RUNTIME_OPT=()
OFFLINE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --runtime) RUNTIME_OPT=(--runtime "$2"); shift ;;
    --offline) OFFLINE="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift ;;
    *) echo "неизвестный параметр: $1" >&2; exit 2 ;;
  esac
  shift
done

SLUG="$(echo "$DISTRO" | tr ':.' '--')"
IMAGE="dcm4chee-test-host:$SLUG"
NAME="dcm4chee-clean-$SLUG"
VOLUME="dcm4chee-clean-$SLUG-containers"

echo "== Образ голого сервера $DISTRO"
docker build -q -t "$IMAGE" - >/dev/null <<DOCKER || exit 1
FROM docker.io/library/$DISTRO
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq systemd systemd-sysv dbus curl ca-certificates iproute2 procps >/dev/null \\
 && apt-get clean && rm -rf /var/lib/apt/lists/*
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKER

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1
  docker volume rm "$VOLUME" >/dev/null 2>&1
}
trap cleanup EXIT
cleanup

echo "== Запуск машины"
# privileged + cgroupns=host — чтобы внутри работали systemd и свой Docker/Podman.
# Хранилище контейнеров — на отдельном томе: overlay поверх overlay не работает.
docker run -d --name "$NAME" --privileged --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw -v "$VOLUME:/var/lib/containers-store" \
  --tmpfs /run --tmpfs /run/lock "$IMAGE" >/dev/null || exit 1
# Docker 29 держит слои в containerd — его каталог тоже уносим на том.
docker exec "$NAME" sh -c 'cd /var/lib/containers-store && mkdir -p docker containerd podman &&
  ln -sfn /var/lib/containers-store/docker /var/lib/docker &&
  ln -sfn /var/lib/containers-store/containerd /var/lib/containerd &&
  mkdir -p /var/lib/containers && ln -sfn /var/lib/containers-store/podman /var/lib/containers/storage'
until docker exec "$NAME" systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do sleep 1; done

echo "== Код на машину"
if [ -n "$OFFLINE" ]; then
  docker cp "$OFFLINE" "$NAME:/opt/bundle.tar.gz"
  docker exec "$NAME" sh -c 'cd /opt && tar xzf bundle.tar.gz'
  INSTALL_DIR=/opt/dcm4chee-offline/deploy
else
  # Ровно то, что лежит в коммите, — как после git clone.
  git -C "$ROOT" archive --format=tar HEAD | docker exec -i "$NAME" sh -c 'mkdir -p /opt/dcm4chee && tar -x -C /opt/dcm4chee'
  INSTALL_DIR=/opt/dcm4chee/deploy
fi

INSTALL_ARGS="--install-runtime ${RUNTIME_OPT[*]+"${RUNTIME_OPT[*]}"}"
if [ -n "$OFFLINE" ]; then
  # Закрытый контур по-настоящему: Docker ставим заранее, затем отключаем машину от сети.
  echo "== Docker заранее, затем машина без сети"
  docker exec "$NAME" sh -c 'curl -fsSL https://get.docker.com | sh >/dev/null 2>&1 && systemctl enable --now docker >/dev/null 2>&1' || exit 1
  docker network disconnect bridge "$NAME" || exit 1
  docker exec "$NAME" sh -c '! curl -s -m 5 -o /dev/null https://registry-1.docker.io' && echo "  ✓ сети нет"
  INSTALL_ARGS=""
fi

echo "== Установка"
docker exec "$NAME" bash -c "cd $INSTALL_DIR && ./install.sh $INSTALL_ARGS" || { echo "УСТАНОВКА НЕ ПРОШЛА"; exit 1; }

echo
echo "== Проверка установленного"
docker exec "$NAME" bash -c '
  set -e
  curl -sf http://127.0.0.1/healthz >/dev/null && echo "  ✓ интерфейс на :80"
  curl -sf http://127.0.0.1/dcm4chee-arc/aets | grep -q DCM4CHEE && echo "  ✓ архив отвечает через интерфейс"
  systemctl is-enabled docker >/dev/null 2>&1 && echo "  ✓ Docker включён в автозапуск" || true
'

if [ -z "$OFFLINE" ]; then
  echo
  echo "== Дымовой тест"
  docker exec "$NAME" bash -c "/opt/dcm4chee/deploy/test/smoke.sh ${RUNTIME_OPT[*]+"${RUNTIME_OPT[*]}"}"
fi
