#!/usr/bin/env bash
# Обновляет JSON-схемы конфигурации из образа dcm4chee-arc.
#
# Штатный UI (dcm4chee-arc-ui2) строит формы конфигурации по этим схемам: названия полей,
# описания, типы, значения по умолчанию, ссылки на другие сущности. Мы берём те же схемы,
# чтобы формы совпадали с возможностями архива той версии, что развёрнута.
#
#   web/scripts/update-schemas.sh                     # версия из docker/compose.yaml
#   web/scripts/update-schemas.sh 5.35.1
#
# После обновления: `npm test` покажет новые поля без перевода (тест schemaRu).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
target="$here/../src/features/settings/schema/dcm4chee"

version="${1:-$(sed -n 's|.*image: dcm4che/dcm4chee-arc-psql:\([0-9.]*\).*|\1|p' "$root/docker/compose.yaml" | head -n1)}"
[ -n "$version" ] || { echo "не удалось определить версию архива" >&2; exit 1; }
image="dcm4che/dcm4chee-arc-psql:$version"

work="$(mktemp -d)"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
container="schemas-$$"

echo "Беру схемы из $image"
docker create --name "$container" "$image" >/dev/null
docker cp "$container:/docker-entrypoint.d/deployments/dcm4chee-arc-ui2-$version.war" "$work/ui2.war"
(cd "$work" && unzip -q ui2.war 'en/assets/schema/*')

rm -f "$target"/*.schema.json
cp "$work"/en/assets/schema/*.schema.json "$target/"
echo "$version" > "$target/VERSION"
echo "Готово: $(find "$target" -name '*.schema.json' | wc -l | tr -d ' ') схем, версия $version"
