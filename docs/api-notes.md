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

## Конфигурация: что проверено вживую

- `GET /devices` — короткие карточки устройств (`hasArcDevExt: true` у самого архива).
- `GET /aes` — все AE со всех устройств, с уже подставленными хостом и портом.
  Идеально для единого списка: не нужно тянуть каждое устройство отдельно.
- `GET /devices/{name}` — устройство целиком. У `dcm4chee-arc` это ~390 КБ
  (основной объём — транспортные возможности восьми AE).
- Запись: `POST /devices/{name}` — создать, `PUT /devices/{name}` — заменить целиком,
  `DELETE /devices/{name}` — удалить. Все три отвечают `204`. Частичной правки нет,
  поэтому изменение одного поля = прочитать устройство, поправить, отправить целиком.
- `POST /ctrl/reload` (204) — работающий архив перечитывает конфигурацию.
  Без него правки лежат в LDAP, но в работе не участвуют.
- `GET /unique/aets` — занятые AE-титлы, для проверки уникальности при создании.
- Ссылка AE на соединение — строка вида `/dicomNetworkConnection/0`, то есть индекс
  в массиве соединений устройства. При удалении соединения ссылки надо пересчитывать.
- C-ECHO через REST в 5.35 не нашёлся: ни `/aets/{aet}/echo/{remote}`,
  ни `/aets/{aet}/dimse/{remote}/echo` — оба 404.

## Кадры для вьюера (WADO-RS): что проверено вживую

- `GET …/series/{series}/metadata` — метаданные всех снимков серии одним запросом
  (их требует загрузчик cornerstone). `AvailableTransferSyntaxUID` (0008,3002) в них **нет** —
  он есть только в QIDO по снимкам: `…/series/{series}/instances?includefield=00083002`.
- `limit` в QIDO проверяется регуляркой `[1-9]\d{0,4}` — больше 99999 даёт `400`.
  Без `limit` (и без `dcmQueryMaxNumberOfResults` в конфиге) архив отдаёт всё.
- **Согласование сжатия кадров.** На `Accept: multipart/related; type=application/octet-stream;
  transfer-syntax=*` dcm4chee отдаёт кадр **несжатым** — разжимает на сервере. Так по умолчанию
  просит cornerstone. Чтобы получить родное сжатие, нужен медиатип формата:
  `image/jp2` (JPEG 2000), `image/jls` (JPEG-LS), `image/jll`, `image/jpeg`, `image/jphc`.
  Ответ приходит с `transfer-syntax=…` в заголовке части. Кадр JPEG 2000 тестового фантома:
  15 КБ вместо 33 КБ. Можно перечислить несколько вариантов через запятую — с несжатым запасным.
- RLE: архив понимает стандартный `image/dicom-rle`, но отвечает **без** `transfer-syntax`,
  а cornerstone знает только `image/x-dicom-rle` (на него dcm4chee отвечает `406`).
  Поэтому RLE просим несжатым.
- `…/instances/{sop}/rendered` — JPEG для картинок и `application/pdf` для Encapsulated PDF.
  `…/frames/{n}/rendered` — конкретный кадр многокадрового снимка.

## cornerstone3D 5.x + Vite: грабли

- Загрузчик кадров нельзя пускать в pre-bundle (`optimizeDeps.exclude`): он создаёт воркер
  через `new URL(…, import.meta.url)`. А его CommonJS-зависимости — наоборот, включить
  (`dicom-parser`, `pako`, кодеки по подпутям `…/decodewasmjs`), иначе нет `export default`.
- vtk.js тянет `xmlbuilder2`, который наследуется от Node-шного `EventEmitter` — нужен npm-пакет
  `events`, иначе «Class extends value undefined».
- `ToolGroup.setToolActive` **дописывает** привязки мыши к прежним. Перед сменой инструмента
  снимаем всё через `setToolPassive(name, { removeAllBindings: true })`.
- Заголовки запросов кадров настраиваются хуком `beforeSend(xhr, imageId)` при `init` загрузчика —
  через него и родное сжатие, и (в будущем) Bearer-токен.
