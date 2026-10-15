#!/usr/bin/env bash
# Дымовой тест развёртывания: ставит комплект во временный каталог на отдельных портах
# (рядом с уже работающими сервисами) и проверяет путь целиком — от установки до
# восстановления из резервной копии.
#
#   deploy/test/smoke.sh [--runtime docker|podman] [--keep]
#
# Нужны: bash, curl, Docker или Podman с compose. Python/pydicom не нужны — снимки готовые.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURES="$ROOT/deploy/test/fixtures"
KEEP=0
RUNTIME_ARG=()
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --runtime) RUNTIME_ARG=(--runtime "$2"); shift ;;
    *) echo "неизвестный параметр: $1" >&2; exit 2 ;;
  esac
  shift
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/dcm4chee-smoke.XXXXXX")"
export COMPOSE_PROJECT_NAME=dcm4chee-smoke
UI=18000
ARCHIVE=18081
DICOM=21112
HL7=22575
MGMT=19991
BASE="http://127.0.0.1:$UI/dcm4chee-arc"
RS="$BASE/aets/DCM4CHEE/rs"

# Копия комплекта: тест не должен трогать .env и данные настоящей установки.
mkdir -p "$WORK/deploy"
cp "$ROOT"/deploy/*.sh "$ROOT"/deploy/*.yaml "$ROOT"/deploy/.env.example "$WORK/deploy/"
ln -s "$ROOT/web" "$WORK/web"
D="$WORK/deploy"

PASSED=0
FAILED=0
STEP_LOG="$WORK/steps.log"
check() {
  local name="$1" output
  shift
  echo "$(date -u +%H:%M:%S) $name" >>"$STEP_LOG"
  if output="$("$@" 2>&1)"; then
    printf '  \033[32m✓\033[0m %s\n' "$name"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %s\n' "$name"
    [ -n "$output" ] && printf '%s\n' "$output" | tail -5 | cut -c1-240 | sed 's/^/      /'
    FAILED=$((FAILED + 1))
  fi
}

# GET, который при неудаче печатает код и тело ответа — чтобы падение было понятным.
http_ok() {
  local code
  code="$(curl -s -m 10 -o "$WORK/http.out" -w '%{http_code}' "$1")"
  [ "${code:0:1}" = 2 ] || { echo "HTTP $code: $(head -c 300 "$WORK/http.out")"; return 1; }
}

cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    echo "Комплект оставлен: $D (остановить: cd $D && ./dcm4chee.sh stop)"
    echo "Шаги по времени: $STEP_LOG"
    return
  fi
  (cd "$D" && RUNTIME="${RUNTIME:-}" ./dcm4chee.sh stop >/dev/null 2>&1)
  local runtime
  runtime="$(sed -n 's/^runtime=//p' "$WORK/runtime" 2>/dev/null)"
  if [ -n "$runtime" ]; then
    "$runtime" compose --env-file "$D/.env" -f "$D/compose.yaml" down -v >/dev/null 2>&1
    # Данные созданы контейнерами (часто от root) — удаляем их тоже контейнером.
    "$runtime" run --rm -v "$WORK:/work" docker.io/library/alpine:3 rm -rf /work/data >/dev/null 2>&1
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

stow() {
  local file="$1" boundary=smoke-boundary-7c1e
  {
    printf -- '--%s\r\nContent-Type: application/dicom\r\n\r\n' "$boundary"
    cat "$file"
    printf -- '\r\n--%s--\r\n' "$boundary"
  } >"$WORK/stow.body"
  curl -sf -m 60 -X POST "$RS/studies" \
    -H "Content-Type: multipart/related; type=\"application/dicom\"; boundary=$boundary" \
    -H 'Accept: application/dicom+json' --data-binary @"$WORK/stow.body"
}

count_by_pid() {
  curl -sf -m 20 "$RS/studies/count?PatientID=$1" | tr -dc '0-9'
}

echo "== Установка (каталог $WORK)"
(
  cd "$D" && ./install.sh ${RUNTIME_ARG[@]+"${RUNTIME_ARG[@]}"} --host 127.0.0.1 --data-dir "$WORK/data" \
    --set UI_PORT=$UI --set ARCHIVE_HTTP_PORT=$ARCHIVE --set DICOM_PORT=$DICOM \
    --set HL7_PORT=$HL7 --set MANAGEMENT_PORT=$MGMT
) || { echo "установка не прошла"; exit 1; }
# Каким рантаймом поставили — нужно для уборки.
(. "$D/lib.sh"; RUNTIME="${RUNTIME_ARG[1]+"${RUNTIME_ARG[1]}"}"; detect_runtime; echo "runtime=$RUNTIME") >"$WORK/runtime"
RT="$(sed -n 's/^runtime=//p' "$WORK/runtime")"
in_project() { (cd "$D" && "$RT" compose --env-file .env -f compose.yaml "$@"); }
ldap_owner() { "$RT" exec "$(in_project ps -q ldap)" stat -c %U /var/lib/openldap/openldap-data/data.mdb; }
slapd_never_crashed() { ! "$RT" logs "$(in_project ps -q ldap)" 2>&1 | grep -q 'Assertion failed'; }
console_local_only() { in_project port arc 9990 | grep -q '^127.0.0.1:'; }

echo
echo "== Проверки"
check "интерфейс жив (/healthz)" curl -sf -m 5 "http://127.0.0.1:$UI/healthz"
check "маршруты SPA отдают приложение (/studies)" sh -c "curl -sf -m 5 'http://127.0.0.1:$UI/studies?q=x' | grep -q '<div id=\"root\">'"
check "архив отвечает через интерфейс (/aets)" sh -c "curl -sf -m 10 '$BASE/aets' | grep -q DCM4CHEE"
check "DICOM-порт $DICOM слушает" bash -c "exec 3<>/dev/tcp/127.0.0.1/$DICOM"
check "пароли не по умолчанию" sh -c "! grep -Eq '^(LDAP_ROOTPASS|POSTGRES_PASSWORD|WILDFLY_ADMIN_PASSWORD)=(secret|pacs|admin|__GENERATED__)$' '$D/.env'"
check ".env доступен только владельцу" sh -c "[ \"\$(ls -l '$D/.env' | cut -c1-10)\" = '-rw-------' ]"
check "консоль WildFly не видна снаружи (только 127.0.0.1)" console_local_only
check "снимок принимается через интерфейс (STOW)" stow "$FIXTURES/study-a.dcm"
check "поиск находит принятое исследование" test "$(count_by_pid SMOKE-A)" = 1
check "./dcm4chee.sh status" sh -c "cd '$D' && ./dcm4chee.sh status"

echo
echo "== Резервная копия и восстановление"
check "backup" sh -c "cd '$D' && ./dcm4chee.sh backup '$WORK/backup'"
check "  в копии есть база" test -s "$WORK/backup/db.dump"
check "  в копии есть конфигурация LDAP" sh -c "grep -q '^dn: dicomDeviceName=dcm4chee-arc' '$WORK/backup/ldap-data.ldif'"
check "  в копии есть настройки" test -s "$WORK/backup/env"

# После копии меняем и базу, и конфигурацию — восстановление должно откатить оба.
check "после копии: ещё одно исследование" stow "$FIXTURES/study-b.dcm"
check "после копии: новое устройство в конфигурации" curl -sS --fail-with-body -m 20 -X POST "$BASE/devices/smoke-node" \
  -H 'Content-Type: application/json' \
  --data '{"dicomDeviceName":"smoke-node","dicomInstalled":true,"dicomNetworkConnection":[{"cn":"dicom","dicomHostname":"10.9.9.9","dicomPort":104}],"dicomNetworkAE":[{"dicomAETitle":"SMOKE_NODE","dicomAssociationAcceptor":true,"dicomNetworkConnectionReference":["/dicomNetworkConnection/0"]}]}'
check "  устройство появилось" http_ok "$BASE/devices/smoke-node"

check "restore" sh -c "cd '$D' && ./dcm4chee.sh restore '$WORK/backup' --yes"
check "  исследование из копии на месте" test "$(count_by_pid SMOKE-A)" = 1
check "  исследование после копии исчезло" test "$(count_by_pid SMOKE-B)" = 0
check "  устройство после копии исчезло" sh -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/devices/smoke-node')\" = 404 ]"
check "  архив снова принимает снимки" stow "$FIXTURES/study-b.dcm"
check "  база LDAP принадлежит ldap, а не root" test "$(ldap_owner)" = ldap
check "  slapd ни разу не падал" slapd_never_crashed

check "повторная копия после восстановления" sh -c "cd '$D' && ./dcm4chee.sh backup '$WORK/backup2'"
check "  и конфигурация после неё читается" http_ok "$BASE/devices/dcm4chee-arc"

echo
echo "== Повторный запуск установки"
check "install.sh повторно — без изменений и без ошибок" sh -c "cd '$D' && cp .env '$WORK/env.before' && ./install.sh ${RUNTIME_ARG[*]+"${RUNTIME_ARG[*]}"} && cmp -s .env '$WORK/env.before'"

echo
echo "Итого: $PASSED прошло, $FAILED не прошло"
[ "$FAILED" -eq 0 ]
