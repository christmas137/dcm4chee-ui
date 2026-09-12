/**
 * Разделы конфигурации устройства-архива.
 *
 * Всё, что штатный UI раскладывает по вложенным вкладкам, здесь описано таблицей:
 * путь внутри JSON устройства, человеческое название и поля для колонок списка.
 * Раздел, не попавший в реестр, всё равно виден — он попадёт в группу «Прочее».
 */

export interface SectionColumn {
  key: string
  title: string
}

export interface SectionDef {
  /** Путь внутри объекта устройства. */
  path: string[]
  label: string
  group: string
  /** Поле-идентификатор элемента: по нему подписываем строки. */
  idKey?: string
  columns?: SectionColumn[]
  hint?: string
}

const ARC = ['dcmDevice', 'dcmArchiveDevice']
const DEV = ['dcmDevice']

export const SECTIONS: SectionDef[] = [
  // Хранение
  {
    path: [...ARC, 'dcmStorage'], label: 'Хранилища', group: 'Хранение', idKey: 'dcmStorageID',
    columns: [
      { key: 'dcmStorageID', title: 'ID' },
      { key: 'dcmURI', title: 'URI' },
      { key: 'dcmStoragePathFormat', title: 'Формат пути' },
      { key: 'dcmDigestAlgorithm', title: 'Хеш' },
    ],
    hint: 'Куда физически кладутся объекты. URI вида file:///storage/fs1/ или s3://…',
  },
  { path: [...ARC, 'dcmBulkDataDescriptor'], label: 'Bulk data', group: 'Хранение', idKey: 'dcmBulkDataDescriptorID' },
  { path: [...ARC, 'dcmStudyRetentionPolicy'], label: 'Сроки хранения', group: 'Хранение', idKey: 'cn' },
  { path: [...ARC, 'dcmArchiveCompressionRule'], label: 'Правила сжатия', group: 'Хранение', idKey: 'cn' },

  // Экспорт и правила
  {
    path: [...ARC, 'dcmExporter'], label: 'Экспортёры', group: 'Экспорт и правила', idKey: 'dcmExporterID',
    columns: [
      { key: 'dcmExporterID', title: 'ID' },
      { key: 'dcmURI', title: 'Назначение' },
      { key: 'dicomAETitle', title: 'AE' },
      { key: 'dcmQueueName', title: 'Очередь' },
    ],
    hint: 'Куда отправлять: dicom:AE_TITLE, storage:ID, xslt:… Используются кнопкой «отправить».',
  },
  { path: [...ARC, 'dcmExportRule'], label: 'Правила экспорта', group: 'Экспорт и правила', idKey: 'cn' },
  { path: [...ARC, 'dcmExportPriorsRule'], label: 'Экспорт предыдущих', group: 'Экспорт и правила', idKey: 'cn' },
  { path: [...ARC, 'dcmRSForwardRule'], label: 'Проброс REST', group: 'Экспорт и правила', idKey: 'cn' },
  { path: [...ARC, 'dcmMPPSForwardRule'], label: 'Проброс MPPS', group: 'Экспорт и правила', idKey: 'cn' },
  { path: [...ARC, 'dcmArchiveAttributeCoercion'], label: 'Подмена атрибутов', group: 'Экспорт и правила', idKey: 'cn' },
  { path: [...ARC, 'dcmArchiveAttributeCoercion2'], label: 'Подмена атрибутов (v2)', group: 'Экспорт и правила', idKey: 'cn' },
  { path: [...ARC, 'dcmStoreAccessControlIDRule'], label: 'Права при приёме', group: 'Экспорт и правила', idKey: 'cn' },
  { path: [...ARC, 'dcmChangeAccessControlIDRule'], label: 'Смена прав', group: 'Экспорт и правила', idKey: 'cn' },

  // Очереди
  {
    path: [...ARC, 'dcmQueue'], label: 'Очереди', group: 'Очереди', idKey: 'dcmQueueName',
    columns: [
      { key: 'dcmQueueName', title: 'Очередь' },
      { key: 'dicomDescription', title: 'Описание' },
      { key: 'dcmMaxRetries', title: 'Повторов' },
      { key: 'dcmRetryDelay', title: 'Задержка' },
    ],
  },

  // Запросы и данные
  {
    path: [...ARC, 'dcmQueryRetrieveView'], label: 'Представления QR', group: 'Запросы и данные', idKey: 'dcmQueryRetrieveViewID',
    columns: [
      { key: 'dcmQueryRetrieveViewID', title: 'ID' },
      { key: 'dcmHideNotRejectedInstances', title: 'Только отклонённые' },
    ],
    hint: 'То, что выбирается селектором AET: какие объекты видно при поиске.',
  },
  { path: [...ARC, 'dcmAttributeFilter'], label: 'Фильтры атрибутов', group: 'Запросы и данные', idKey: 'dcmEntity' },
  { path: [...ARC, 'dcmAttributeSet'], label: 'Наборы атрибутов', group: 'Запросы и данные', idKey: 'dcmAttributeSetID',
    columns: [
      { key: 'dcmAttributeSetID', title: 'ID' },
      { key: 'dcmAttributeSetType', title: 'Тип' },
      { key: 'dcmAttributeSetTitle', title: 'Название' },
    ] },
  { path: [...ARC, 'dcmRejectionNote'], label: 'Причины отклонения', group: 'Запросы и данные', idKey: 'dcmRejectionNoteLabel',
    columns: [
      { key: 'dcmRejectionNoteLabel', title: 'Причина' },
      { key: 'dcmRejectionNoteType', title: 'Тип' },
    ] },
  { path: [...ARC, 'dcmIDGenerator'], label: 'Генераторы ID', group: 'Запросы и данные', idKey: 'dcmIDGeneratorName' },
  { path: [...ARC, 'dcmMetrics'], label: 'Метрики', group: 'Запросы и данные', idKey: 'dcmMetricsName' },
  { path: [...ARC, 'dcmPDQService'], label: 'Службы PDQ', group: 'Запросы и данные', idKey: 'dcmPDQServiceID' },

  // UPS / рабочие элементы
  { path: [...ARC, 'dcmUPSProcessingRule'], label: 'Обработка UPS', group: 'UPS и MWL', idKey: 'dcmUPSProcessingRuleID' },
  { path: [...ARC, 'dcmUPSOnStore'], label: 'UPS при приёме', group: 'UPS и MWL', idKey: 'dcmUPSOnStoreID' },
  { path: [...ARC, 'dcmUPSOnUPSCompleted'], label: 'UPS по завершении', group: 'UPS и MWL', idKey: 'cn' },
  { path: [...ARC, 'dcmUPSOnUPSCanceled'], label: 'UPS при отмене', group: 'UPS и MWL', idKey: 'cn' },
  { path: [...ARC, 'dcmMWLImport'], label: 'Импорт MWL', group: 'UPS и MWL', idKey: 'dcmMWLImportID' },
  { path: [...ARC, 'dcmMWLIdleTimeout'], label: 'Протухание MWL', group: 'UPS и MWL', idKey: 'cn' },

  // HL7
  { path: [...ARC, 'hl7ForwardRule'], label: 'Проброс HL7', group: 'HL7', idKey: 'cn' },
  { path: [...ARC, 'hl7ExportRule'], label: 'Экспорт по HL7', group: 'HL7', idKey: 'cn' },
  { path: [...ARC, 'hl7PrefetchRule'], label: 'Предзагрузка по HL7', group: 'HL7', idKey: 'cn' },
  { path: [...ARC, 'hl7StudyRetentionPolicy'], label: 'Сроки хранения по HL7', group: 'HL7', idKey: 'cn' },
  { path: [...ARC, 'hl7OrderScheduledStation'], label: 'Станции по заказу', group: 'HL7', idKey: 'cn' },
  { path: [...ARC, 'hl7OrderSPSStatus'], label: 'Статусы заказов', group: 'HL7', idKey: 'dcmSPSStatus' },
  { path: [...ARC, 'hl7UPSOnHL7'], label: 'UPS по HL7', group: 'HL7', idKey: 'cn' },
  { path: [...DEV, 'hl7Application'], label: 'HL7-приложения', group: 'HL7', idKey: 'hl7ApplicationName' },

  // Устройство целиком
  {
    path: [...DEV, 'dcmWebApp'], label: 'Веб-приложения', group: 'Службы устройства', idKey: 'dcmWebAppName',
    columns: [
      { key: 'dcmWebAppName', title: 'Имя' },
      { key: 'dcmWebServicePath', title: 'Путь' },
      { key: 'dicomAETitle', title: 'AE' },
    ],
    hint: 'REST-точки архива: какой путь какому AE и каким сервисам соответствует.',
  },
  { path: [...DEV, 'dcmImageReader'], label: 'Чтение изображений', group: 'Службы устройства', idKey: 'dcmIMTransferSyntax' },
  { path: [...DEV, 'dcmImageWriter'], label: 'Запись изображений', group: 'Службы устройства', idKey: 'dcmIMTransferSyntax' },
  { path: [...DEV, 'dcmAuditLogger'], label: 'Аудит', group: 'Службы устройства', idKey: 'cn' },
  { path: [...DEV, 'dcmuiConfig'], label: 'Настройки штатного UI', group: 'Службы устройства', idKey: 'dcmuiConfigName' },
]

export function getAtPath(root: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    root,
  )
}

/** Возвращает копию `root` с заменённым значением по пути (исходный объект не трогаем). */
export function setAtPath<T>(root: T, path: string[], value: unknown): T {
  if (path.length === 0) return value as T
  const [head, ...rest] = path
  const source = (root ?? {}) as Record<string, unknown>
  const child = rest.length ? setAtPath(source[head] ?? {}, rest, value) : value
  return { ...source, [head]: child } as T
}

export function sectionItems(device: unknown, section: SectionDef): Record<string, unknown>[] {
  const value = getAtPath(device, section.path)
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Подпись элемента раздела: идентификатор, иначе первое осмысленное поле. */
export function itemLabel(item: Record<string, unknown>, section: SectionDef): string {
  const byId = section.idKey ? item[section.idKey] : undefined
  if (typeof byId === 'string' || typeof byId === 'number') return String(byId)
  for (const key of ['cn', 'dicomDescription', 'dcmURI']) {
    const value = item[key]
    if (typeof value === 'string') return value
  }
  const first = Object.values(item).find((value) => typeof value === 'string' || typeof value === 'number')
  return first === undefined ? '(без названия)' : String(first)
}

/** Разделы, которых нет в реестре, но которые есть в устройстве — чтобы ничего не потерялось. */
export function extraSections(device: unknown): SectionDef[] {
  const known = new Set(SECTIONS.map((section) => section.path.join('/')))
  const found: SectionDef[] = []
  for (const base of [DEV, ARC]) {
    const node = getAtPath(device, base)
    if (!node || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const path = [...base, key]
      if (!Array.isArray(value) || known.has(path.join('/'))) continue
      if (value.length && typeof value[0] !== 'object') continue // списки строк — это не разделы
      found.push({ path, label: key, group: 'Прочее' })
    }
  }
  return found.sort((a, b) => a.label.localeCompare(b.label))
}

/** Скалярные настройки уровня `dcmArchiveDevice` — те самые «мелкие крутилки». */
export function scalarSettings(device: unknown): [string, string | number | boolean][] {
  const node = getAtPath(device, ARC)
  if (!node || typeof node !== 'object') return []
  return Object.entries(node as Record<string, unknown>)
    .filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1]
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    })
    .sort(([a], [b]) => a.localeCompare(b))
}

export const ARCHIVE_EXT_PATH = ARC
