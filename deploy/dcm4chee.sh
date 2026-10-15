#!/usr/bin/env bash
# Сопровождение развёрнутого dcm4chee.
#
#   ./dcm4chee.sh status                  что запущено и отвечает ли
#   ./dcm4chee.sh logs [arc|db|ldap|ui]   журналы (последние 200 строк и дальше в реальном времени)
#   ./dcm4chee.sh start | stop | restart
#   ./dcm4chee.sh backup [КАТАЛОГ] [--with-storage]
#   ./dcm4chee.sh restore КАТАЛОГ [--yes]
#   ./dcm4chee.sh update                  скачать версии из .env и перезапустить
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

RUNTIME="${RUNTIME:-}"
detect_runtime
[ -n "$RUNTIME" ] || die "не найден ни Docker с compose, ни Podman с compose"
load_env

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }

full_only() {
  [ "$(current_mode)" = full ] || die "в режиме «только интерфейс» архива здесь нет — команда «$1» неприменима"
}

cmd_status() {
  compose ps
  echo
  if ui_ready; then ok "интерфейс и архив отвечают: http://127.0.0.1:${UI_PORT}/"; else warn "интерфейс или архив не отвечает"; fi
  if [ "$(current_mode)" = full ]; then
    local count
    count=$(curl -sf -m 10 "http://127.0.0.1:${UI_PORT}/dcm4chee-arc/aets/DCM4CHEE/rs/studies/count" | tr -dc '0-9' || true)
    [ -n "$count" ] && info "исследований в архиве: $count"
    info "место под данные: $(df -Ph "$DATA_DIR" | awk 'NR == 2 {print $4 " свободно из " $2}')"
  fi
}

cmd_logs() {
  compose logs --tail 200 -f "$@"
}

cmd_start() {
  compose up -d
  step "Ждём готовности"
  wait_ready 900
  ok "всё отвечает"
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

# Резервная копия: база (pg_dump), конфигурация (LDAP целиком), настройки (.env).
# Снимки (--with-storage) — опционально: их объём может быть огромным, и обычно их копируют
# средствами хранилища (rsync, снапшоты).
cmd_backup() {
  full_only backup
  local dir="" with_storage=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --with-storage) with_storage=1 ;;
      *) dir="$1" ;;
    esac
    shift
  done
  dir="${dir:-$DEPLOY_DIR/backups/$(date +%Y%m%d-%H%M%S)}"
  mkdir -p "$dir"
  chmod 700 "$dir"

  step "Резервная копия в $dir"
  compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$dir/db.dump"
  ok "база: $(du -h "$dir/db.dump" | cut -f1)"
  # LDAP — по протоколу, как обычный клиент, а не slapcat по файлам базы: slapcat по живой
  # LMDB роняет slapd 2.6.15 на следующей записи (Assertion failed: mdb_opinfo_get) —
  # поймано дымовым тестом. Записи упорядочиваются «родитель раньше ребёнка» — так их ждёт slapadd.
  # shellcheck disable=SC2016  # переменные раскрываются внутри контейнера, не здесь
  compose exec -T ldap sh -c '. setenv.sh; ldapsearch -x -H ldap://127.0.0.1 -D "cn=admin,$LDAP_BASE_DN" \
    -w "$LDAP_ROOTPASS" -b "$LDAP_BASE_DN" -LLL -o ldif-wrap=no "(objectClass=*)"' | ldif_parents_first >"$dir/ldap-data.ldif"
  # Конфигурация самого slapd — обычные LDIF-файлы, их можно просто сложить.
  tar -C "$DATA_DIR" -cf "$dir/ldap-config.tar" slapd.d
  local entries
  entries=$(grep -c '^dn:' "$dir/ldap-data.ldif" || true)
  [ "$entries" -gt 0 ] || die "конфигурация LDAP не выгрузилась — проверьте ./dcm4chee.sh logs ldap"
  ok "конфигурация LDAP: $entries записей"
  cp "$ENV_FILE" "$dir/env"
  chmod 600 "$dir/env"
  ok "настройки и пароли (.env)"
  if [ "$with_storage" -eq 1 ]; then
    info "копируем снимки — это может быть долго…"
    tar -C "$DATA_DIR" -cf "$dir/storage.tar" storage
    ok "снимки: $(du -h "$dir/storage.tar" | cut -f1)"
  else
    info "снимки не копировались (добавьте --with-storage или копируйте $DATA_DIR/storage сами)"
  fi
  {
    echo "created=$(date -Iseconds)"
    echo "arc_version=$ARC_VERSION"
    echo "ldap_version=$LDAP_VERSION"
    echo "postgres_version=$POSTGRES_VERSION"
  } >"$dir/manifest"
  ok "готово"
}

# Восстановление поверх работающего комплекта. Для переезда на новый сервер:
# положить env из копии как .env, выполнить install.sh (поднимет пустой архив с теми же
# паролями), затем restore.
cmd_restore() {
  full_only restore
  local dir="" yes=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes) yes=1 ;;
      *) dir="$1" ;;
    esac
    shift
  done
  [ -n "$dir" ] || die "укажите каталог с резервной копией"
  dir="$(cd "$dir" && pwd)"
  [ -f "$dir/db.dump" ] && [ -f "$dir/ldap-data.ldif" ] || die "в $dir нет db.dump или ldap-data.ldif"

  if [ "$yes" -ne 1 ]; then
    printf 'Текущие база и конфигурация будут заменены копией из %s. Продолжить? [y/N] ' "$dir"
    read -r answer
    case "$answer" in y|Y|д|Д) ;; *) die "отменено" ;; esac
  fi

  step "Останавливаем архив"
  compose stop arc ui >/dev/null

  step "База"
  compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner <"$dir/db.dump"
  ok "восстановлена"

  step "Конфигурация (LDAP)"
  compose stop ldap >/dev/null
  rm -f "$DATA_DIR"/ldap/*.mdb
  # slapadd — от root (каталог копии закрыт для чужих), затем база отдаётся пользователю slapd.
  # Точка входа образа пересоздаёт ldap с uid LDAP_USER_ID (1021), а в одноразовом контейнере,
  # запущенном мимо неё, ldap — это uid 100. Поэтому владелец — числом из setenv.sh образа.
  # shellcheck disable=SC2016  # переменные раскрываются внутри контейнера, не здесь
  compose run --rm --no-deps -T -v "$dir:/backup:ro" --entrypoint sh ldap -c \
    '. setenv.sh && slapadd -q -n 1 -F /etc/openldap/slapd.d -l /backup/ldap-data.ldif &&
     chown -R "$LDAP_USER_ID:$LDAP_GROUP_ID" /var/lib/openldap/openldap-data'
  ok "восстановлена: $(grep -c '^dn:' "$dir/ldap-data.ldif") записей"

  if [ -f "$dir/storage.tar" ]; then
    step "Снимки"
    tar -C "$DATA_DIR" -xf "$dir/storage.tar"
    ok "восстановлены"
  fi

  cmd_start
}

# Обновление на версии, указанные в .env. Смену минорной версии архива (5.35 → 5.36)
# не делаем молча: между ними бывают миграции схемы базы — см. заметки к выпуску dcm4chee.
cmd_update() {
  if [ "$(current_mode)" = full ]; then
    local running
    running=$("$RUNTIME" inspect --format '{{.Config.Image}}' "$(compose ps -q arc)" 2>/dev/null | sed 's/.*://' || true)
    if [ -n "$running" ] && [ "${running%.*}" != "${ARC_VERSION%.*}" ] && [ "${1:-}" != --force ]; then
      die "архив $running → $ARC_VERSION: смена минорной версии. Сначала сделайте backup и проверьте миграции базы
       в заметках к выпуску: https://github.com/dcm4che/dcm4chee-arc-light/releases
       Затем: ./dcm4chee.sh update --force"
    fi
    step "Скачиваем образы"
    compose pull ldap db arc
  fi
  if [ -f "$DEPLOY_DIR/../web/Dockerfile" ]; then
    step "Пересобираем интерфейс"
    "$RUNTIME" build -q -t "localhost/dcm4chee-ui:${UI_VERSION}" "$DEPLOY_DIR/../web" >/dev/null
  fi
  cmd_start
}

command="${1:-}"
[ $# -gt 0 ] && shift
case "$command" in
  status) cmd_status ;;
  logs) cmd_logs "$@" ;;
  start) cmd_start ;;
  stop) compose stop ;;
  restart) compose restart && wait_ready 900 && ok "всё отвечает" ;;
  backup) cmd_backup "$@" ;;
  restore) cmd_restore "$@" ;;
  update) cmd_update "$@" ;;
  ""|-h|--help|help) usage ;;
  *) usage >&2; die "неизвестная команда: $command" ;;
esac
