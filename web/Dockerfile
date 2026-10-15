# Образ нового интерфейса dcm4chee: сборка фронта → nginx со статикой и прокси на архив.
#
#   docker build -t dcm4chee-ui web/
#   docker run -p 80:80 -e ARCHIVE_URL=http://arc:8080 dcm4chee-ui

# Сборка фронта — на родной платформе сборщика: результат (статика) от архитектуры не зависит,
# а образ под x86-сервер с ARM-машины так собирается без медленной эмуляции.
# Имена образов — полные: Podman без настройки registries.conf коротких не понимает.
FROM --platform=$BUILDPLATFORM docker.io/library/node:24-alpine AS build
WORKDIR /app
# Сначала только манифесты — слой с зависимостями переиспользуется, пока они не менялись.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --no-update-notifier
COPY . .
RUN npm run build

FROM docker.io/library/nginx:1.30-alpine
# Шаблоны из /etc/nginx/templates образ nginx сам прогоняет через envsubst при старте.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Адрес архива, куда проксируется /dcm4chee-arc (без пути на конце).
ENV ARCHIVE_URL=http://arc:8080
# envsubst трогает только эту переменную — $uri и прочие переменные nginx остаются как есть.
ENV NGINX_ENVSUBST_FILTER=^ARCHIVE_URL$

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
