#!/usr/bin/env bash
# Юнит-тесты логики скриптов развёртывания: определение адреса сервера, правка .env,
# порядок записей LDIF для восстановления. Внешние команды (ip, hostname) подменяются.
#
#   deploy/test/unit.sh

# Тела заглушек — в одинарных кавычках намеренно: $1 раскрывается при вызове заглушки.
# shellcheck disable=SC2016
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/../lib.sh"

PASSED=0
FAILED=0
expect() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf '  \033[32m✓\033[0m %s\n' "$name"; PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %s\n      ждали: %s\n      было:  %s\n' "$name" "$expected" "$actual"; FAILED=$((FAILED + 1))
  fi
}

STUBS="$(mktemp -d)"
trap 'rm -rf "$STUBS"' EXIT

# Подмена команды: stub ИМЯ 'тело скрипта'. Без stub — команды нет вовсе (PATH только на подмены).
stub() { printf '#!/bin/sh\n%s\n' "$2" >"$STUBS/$1"; chmod +x "$STUBS/$1"; }
reset_stubs() { rm -f "$STUBS"/*; for tool in awk sed grep cat sh base64 printf; do ln -sf "$(command -v "$tool")" "$STUBS/$tool"; done; }
host_with_stubs() { PATH="$STUBS" detect_host; }

echo "== Адрес сервера"
reset_stubs
stub ip '[ "$1" = route ] && echo "1.1.1.1 via 10.0.0.1 dev eth0 src 10.0.0.15 uid 0"'
expect "берётся источник маршрута по умолчанию" 10.0.0.15 "$(host_with_stubs)"

reset_stubs
stub ip 'if [ "$1" = route ]; then exit 2; fi
echo "3: docker0    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0"
echo "4: br-5f3a    inet 172.18.0.1/16 brd 172.18.255.255 scope global br-5f3a"
echo "2: eth0    inet 10.0.0.15/24 brd 10.0.0.255 scope global eth0"'
stub hostname 'echo "172.18.0.1 172.17.0.1 10.0.0.15"'
expect "без маршрута по умолчанию — мосты Docker пропускаются" 10.0.0.15 "$(host_with_stubs)"

reset_stubs
stub hostname 'echo "192.168.1.5 172.17.0.1"'
expect "без ip — первый адрес из hostname -I" 192.168.1.5 "$(host_with_stubs)"

reset_stubs
expect "ничего не известно — 127.0.0.1" 127.0.0.1 "$(host_with_stubs)"

echo "== Выбор рантайма"
runtime_with_stubs() { RUNTIME="$1"; PATH="$STUBS" detect_runtime; echo "${RUNTIME:-нет}"; }
reset_stubs
stub docker 'exit 0'
stub podman 'exit 0'
expect "оба есть — Docker" docker "$(runtime_with_stubs '')"
expect "явно Podman — Podman" podman "$(runtime_with_stubs podman)"
reset_stubs
stub podman 'exit 0'
expect "только Podman — Podman" podman "$(runtime_with_stubs '')"
expect "явно Docker, а его нет — «нет», без аварийного выхода" нет "$(runtime_with_stubs docker)"
reset_stubs
stub docker '[ "$1" = compose ] && exit 1; exit 0'
expect "Docker без плагина compose — непригоден" нет "$(runtime_with_stubs '')"

echo "== Правка .env"
ENV_FILE="$(mktemp)"
printf '# комментарий\nUI_PORT=80\nDATA_DIR=/var/lib/dcm4chee\nARCHIVE_URL=http://arc:8080\n' >"$ENV_FILE"
set_env UI_PORT 8000
set_env DATA_DIR '/data/p&cs'
set_env ARCHIVE_URL 'http://h:8080/a=b'
set_env LDAP_ROOTPASS 'не-было'
expect "значение заменено" "UI_PORT=8000" "$(grep '^UI_PORT=' "$ENV_FILE")"
expect "спецсимволы & и / не ломают замену" "DATA_DIR=/data/p&cs" "$(grep '^DATA_DIR=' "$ENV_FILE")"
expect "знак = в значении сохраняется" "ARCHIVE_URL=http://h:8080/a=b" "$(grep '^ARCHIVE_URL=' "$ENV_FILE")"
printf 'PASS=x\n' >>"$ENV_FILE"
set_env PASS 'a\nb\\c'
expect "обратные слэши в значении не раскрываются" 'PASS=a\nb\\c' "$(grep '^PASS=' "$ENV_FILE")"
expect "комментарии на месте" "# комментарий" "$(head -1 "$ENV_FILE")"
expect "неизвестный ключ не добавляется молча" "" "$(grep '^LDAP_ROOTPASS=' "$ENV_FILE")"
rm -f "$ENV_FILE"

echo "== Порядок записей LDIF"
printf 'dn: cn=b,cn=a,dc=x\ncn: b\n\ndn:: %s\ncn: k\n\ndn: dc=x\ndc: x\n\ndn: cn=a,dc=x\ncn: a\n\ndn: cn=a\\,c,dc=x\ncn: a,c\n' \
  "$(printf 'cn=к,cn=a,dc=x' | base64)" >"$STUBS/in.ldif"
order="$(ldif_parents_first <"$STUBS/in.ldif" | grep '^dn' | tr '\n' '|')"
expect "родители раньше детей, экранированная запятая не делает уровень, base64-DN учтён" \
  "dn: dc=x|dn: cn=a,dc=x|dn: cn=a\\,c,dc=x|dn: cn=b,cn=a,dc=x|dn:: $(printf 'cn=к,cn=a,dc=x' | base64)|" "$order"
expect "атрибуты записей не теряются" 5 "$(ldif_parents_first <"$STUBS/in.ldif" | grep -Ec '^(cn|dc): ')"

echo
echo "Итого: $PASSED прошло, $FAILED не прошло"
[ "$FAILED" -eq 0 ]
