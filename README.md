# dcm4chee web UI

Новый веб-интерфейс к [dcm4chee-arc-light](https://github.com/dcm4che/dcm4chee-arc-light).
Отдельное SPA поверх REST API архива — бэкенд не патчится.

Ход работ и решения: [PLAN.md](PLAN.md).

## Локальный стенд

```sh
docker compose -f docker/compose.yaml up -d
# архив:            http://localhost:8080/dcm4chee-arc
# WildFly console:  http://localhost:9990  (admin/admin)
# DICOM C-STORE:    localhost:11112, AE Title DCM4CHEE

# старый Angular-UI для сравнения (опционально):
docker compose -f docker/compose.yaml --profile legacy-ui up -d   # http://localhost:18080
```

## Фронт

```sh
cd web && npm install && npm run dev   # http://localhost:5173
```

## Справочники

- `docs/openapi.json` — официальная OpenAPI 3.0-спека архива (5.34.0).
- `docs/api-notes.md` — выжимка по реально используемым эндпоинтам и граблям.
