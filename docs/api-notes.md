# Заметки по REST API dcm4chee-arc-light

Полная спека — `openapi.json` (OpenAPI 3.0, версия 5.34.0, 285 путей). Здесь — выжимка
по тому, что реально используем, с базовым префиксом `/dcm4chee-arc`.

Пути в спеке даны **без** префикса `/dcm4chee-arc` — не забывать добавлять.
В спеке пути ссылаются на внешние файлы через `$ref`, поэтому codegen «из коробки»
не работает: нужен предварительный bundle (`@redocly/cli bundle`). Мы пишем клиент руками.

## CORS

`dcm4chee-arc-cors/CorsFilter` — JAX-RS `@Provider` без ограничения по путям:
- `Access-Control-Allow-Origin: *` (жёстко, не конфигурируется)
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD`
- `Access-Control-Allow-Headers` — по умолчанию `origin, content-type, accept, authorization`,
  меняется через env `ACCESS_CONTROL_ALLOW_HEADERS`
- `Access-Control-Expose-Headers` — по умолчанию `content-type, warning, location, content-location`,
  env `ACCESS_CONTROL_EXPOSE_HEADERS`

Значит SPA может ходить в архив напрямую с другого origin. В dev всё равно используем
vite-proxy — чтобы не разводить абсолютные URL и заранее уложиться в прод-схему с nginx.

Важно: `warning` в expose-headers — архив кладёт в заголовок `Warning` причины частичного
результата (например, недоступный внешний AE при QIDO). Показываем это в UI.

## Поиск (QIDO-RS)

```
GET /aets/{aet}/rs/studies          ?  фильтры + includefield, offset, limit, orderby, fuzzymatching
GET /aets/{aet}/rs/studies/count
GET /aets/{aet}/rs/studies/size
GET /aets/{aet}/rs/studies/{study}/series
GET /aets/{aet}/rs/studies/{study}/series/count
GET /aets/{aet}/rs/studies/{study}/series/{series}/instances
GET /aets/{aet}/rs/patients        (+ /count)
GET /aets/{aet}/rs/mwlitems        (+ /count)  — рабочий список модальности
```

Ответ — DICOM JSON: массив объектов, ключи это теги вида `00100010`,
значения `{ "vr": "PN", "Value": [{ "Alphabetic": "Ivanov^Ivan" }] }`.

Полезные фильтры: `PatientName` (wildcard `*`), `PatientID`, `StudyDate` (`20240101-20240131`),
`StudyTime`, `AccessionNumber`, `ModalitiesInStudy`, `StudyDescription`, `StudyInstanceUID`,
`fuzzymatching=true` (требует `dcmFuzzyAlgorithmClass` на сервере).

## Изображения (WADO-RS)

```
GET /aets/{aet}/rs/studies/{study}/metadata
GET /aets/{aet}/rs/studies/{study}/series/{series}/metadata
GET /aets/{aet}/rs/studies/{study}/series/{series}/instances/{sop}/frames/{frames}
GET /aets/{aet}/rs/studies/{study}/thumbnail                       — превью исследования
GET /aets/{aet}/rs/studies/{study}/series/{series}/thumbnail       — превью серии
GET /aets/{aet}/rs/studies/{study}/rendered                        — серверный рендер (fallback)
GET /aets/{aet}/wado?requestType=WADO&...                          — старый WADO-URI
```

## Загрузка (STOW-RS)

```
POST /aets/{aet}/rs/studies              Content-Type: multipart/related; type="application/dicom"
POST /aets/{aet}/rs/studies/{study}
```

## Отправка и экспорт

```
POST /aets/{aet}/rs/studies/{study}/export/{exporterID}
POST /aets/{aet}/rs/studies/{study}/series/{series}/export/{exporterID}
POST /aets/{aet}/dimse/{movescp}/studies/{study}/export/dicom:{destination}   — C-MOVE на внешний AE
POST /aets/{aet}/rs/studies/{study}/stgcmt/dicom:{stgCmtSCP}                  — storage commitment
POST /aets/{aet}/rs/studies/{study}/reject/{codeValue}^{codingSchemeDesignator}
PUT  /aets/{aet}/rs/studies/{study}/expire/{expirationDate}
```

## Задачи и мониторинг

Задачи разнесены по типам, API у всех одинаковый по форме:

```
GET    /monitor/{export|retrieve|stgver|diff}            — список
GET    /monitor/{...}/count
POST   /monitor/{...}/cancel                             — массово по фильтру
POST   /monitor/{...}/reschedule
DELETE /monitor/{...}/{taskID}
POST   /monitor/{...}/{taskID}/cancel
POST   /monitor/{...}/{taskID}/reschedule
GET    /monitor/associations                             — живые DIMSE-соединения
GET    /monitor/serverTime, /monitor/serverTimeZone
GET    /queue/{queueName}  (+ /count, /cancel, /reschedule, DELETE)
```

## Конфигурация

```
GET /aets                       — список AE архива (для селектора AET)
GET /aes                        — все Application Entities
GET /devices, /devices/{device}
GET /webapps
GET /storage
GET /ui2/rs/dcm4chee-arc        — конфиг UI (в т.ч. настройки старого интерфейса)
GET /ui2/rs/keycloak.json       — параметры OIDC, если инстанс secure
GET /metrics/{name}
    /ctrl/*                     — управление архивом (reload конфигурации и т.п.)
```

## Проверенные на живом сервере мелочи (5.35.1)

- Пустой результат QIDO — `204 No Content`, тела нет. Клиент отдаёт `[]`.
- Приватный тег `77771029` (UL) — размер исследования в КБ. Запрашивается через
  `includefield=77771029`, в ответе есть всегда, когда исследование хранится локально.
  Соседние приватные теги группы 7777: `77771028` — имя storage-пула (`fs1`),
  `77771010/1011/1020…` — служебные метки времени.
- `orderby=-StudyDate,-StudyTime` — работает, минус = по убыванию, поля через запятую.
- Мультизначное сопоставление: `ModalitiesInStudy=CT\MR` (обратный слэш), URL-кодируется.
- Маски: `PatientName=*Иванов*Иван*` находит и по отчеству — `*` перекрывает `^`.
  Кириллица работает без плясок, если в данных `SpecificCharacterSet = ISO_IR 192`.
- `StudyDate` принимает открытые интервалы: `20240101-`, `-20240131`.
- Нечёткий поиск (`fuzzymatching=true`) требует `dcmFuzzyAlgorithmClass` в конфиге девайса —
  на дефолтном стенде не включён, поэтому опираемся на маски.
