/**
 * Подсказки для полей-ссылок. В схеме у таких полей есть `format`: `dcmAETitle` — AE-титл
 * любого узла, `dcmStorageID` — ID хранилища архива, `dcmQueueName` — очередь и т. д.
 * Вместо того чтобы помнить и перепечатывать идентификаторы, выбираем из того, что уже есть
 * в конфигурации. Ввести своё значение всё равно можно — ссылка может быть на ещё не созданное.
 */
import { createContext, use } from 'react'
import { TRANSFER_SYNTAX_NAMES } from '../dicomUids'
import { getSchema } from './model'
import { getIn } from './values'

export interface Suggestion {
  value: string
  /** Пояснение: имя синтаксиса, описание AE, адрес. */
  label?: string
}

export type Suggestions = Record<string, Suggestion[]>

export const ConfigRefsContext = createContext<Suggestions>({})

/**
 * Значения уровня устройства, которые наследуют AE и HL7-приложения архива: у них
 * «не задано» означает не умолчание схемы, а «как у устройства». Ключи те же.
 */
export const InheritedContext = createContext<Record<string, unknown>>({})

/** Схемы, чьи поля переопределяют одноимённые поля устройства. */
const INHERITING = new Set(['archiveNetworkAE.schema.json', 'archiveHL7Application.schema.json', 'dcmNetworkAE.schema.json'])

/**
 * Действующее значение уровня устройства для поля AE: заданное в конфигурации устройства,
 * иначе умолчание схемы устройства (у AE своего умолчания обычно нет — он наследует).
 */
export function useInherited(schema: string, key: string): unknown {
  const inherited = use(InheritedContext)
  if (!INHERITING.has(schema)) return undefined
  return inherited[key]
    ?? getSchema('archiveDevice.schema.json').properties[key]?.default
    ?? getSchema('dcmDevice.schema.json').properties[key]?.default
}

/** Одиночные значения `dcmDevice` и `dcmArchiveDevice` архива — источник наследования. */
export function buildInherited(archive: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const path of [['dcmDevice'], ['dcmDevice', 'dcmArchiveDevice']]) {
    const node = getIn(archive, path)
    if (!node || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const scalar = typeof value !== 'object' || (Array.isArray(value) && typeof value[0] !== 'object')
      if (scalar && value !== null) result[key] = value
    }
  }
  return result
}

export function useSuggestions(format: string | undefined): Suggestion[] {
  const all = use(ConfigRefsContext)
  return format ? all[format] ?? STATIC[format] ?? [] : []
}

/** Наборы, которые не зависят от конфигурации. */
const STATIC: Suggestions = {
  dcmTransferSyntax: Object.entries(TRANSFER_SYNTAX_NAMES).map(([value, label]) => ({ value, label })),
  dcmSOPClass: [
    ['1.2.840.10008.1.1', 'Verification'],
    ['1.2.840.10008.5.1.4.1.1.1', 'CR Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.1.1', 'Digital X-Ray Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.1.2', 'Digital Mammography Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.2', 'CT Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.2.1', 'Enhanced CT Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.4', 'MR Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.4.1', 'Enhanced MR Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.6.1', 'Ultrasound Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.3.1', 'Ultrasound Multi-frame Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.7', 'Secondary Capture Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.12.1', 'X-Ray Angiographic Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.20', 'Nuclear Medicine Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.128', 'PET Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.11.1', 'Grayscale Softcopy Presentation State Storage'],
    ['1.2.840.10008.5.1.4.1.1.88.11', 'Basic Text SR Storage'],
    ['1.2.840.10008.5.1.4.1.1.88.22', 'Enhanced SR Storage'],
    ['1.2.840.10008.5.1.4.1.1.88.33', 'Comprehensive SR Storage'],
    ['1.2.840.10008.5.1.4.1.1.88.59', 'Key Object Selection Document Storage'],
    ['1.2.840.10008.5.1.4.1.1.104.1', 'Encapsulated PDF Storage'],
    ['1.2.840.10008.5.1.4.1.1.481.1', 'RT Image Storage'],
    ['1.2.840.10008.5.1.4.1.1.481.2', 'RT Dose Storage'],
    ['1.2.840.10008.5.1.4.1.1.481.3', 'RT Structure Set Storage'],
    ['1.2.840.10008.5.1.4.1.1.481.5', 'RT Plan Storage'],
    ['1.2.840.10008.5.1.4.1.2.1.1', 'Patient Root Q/R — FIND'],
    ['1.2.840.10008.5.1.4.1.2.1.2', 'Patient Root Q/R — MOVE'],
    ['1.2.840.10008.5.1.4.1.2.1.3', 'Patient Root Q/R — GET'],
    ['1.2.840.10008.5.1.4.1.2.2.1', 'Study Root Q/R — FIND'],
    ['1.2.840.10008.5.1.4.1.2.2.2', 'Study Root Q/R — MOVE'],
    ['1.2.840.10008.5.1.4.1.2.2.3', 'Study Root Q/R — GET'],
    ['1.2.840.10008.5.1.4.31', 'Modality Worklist — FIND'],
    ['1.2.840.10008.3.1.2.3.3', 'Modality Performed Procedure Step'],
    ['1.2.840.10008.1.20.1', 'Storage Commitment Push Model'],
  ].map(([value, label]) => ({ value, label })),
  dcmCharset: [
    ['ISO_IR 192', 'Unicode UTF-8'],
    ['ISO_IR 144', 'Кириллица (ISO 8859-5)'],
    ['ISO_IR 100', 'Латиница-1 (ISO 8859-1)'],
    ['ISO_IR 101', 'Латиница-2'],
    ['ISO_IR 109', 'Латиница-3'],
    ['ISO_IR 110', 'Латиница-4'],
    ['ISO_IR 148', 'Латиница-5'],
    ['ISO_IR 126', 'Греческий'],
    ['ISO_IR 127', 'Арабский'],
    ['ISO_IR 138', 'Иврит'],
    ['ISO_IR 166', 'Тайский'],
    ['ISO_IR 13', 'Японский (JIS X 0201)'],
    ['GB18030', 'Китайский (GB18030)'],
    ['GBK', 'Китайский (GBK)'],
  ].map(([value, label]) => ({ value, label })),
  hl7Charset: [
    ['UNICODE UTF-8', 'Unicode UTF-8'],
    ['ASCII', 'ASCII'],
    ['8859/5', 'Кириллица (ISO 8859-5)'],
    ['8859/1', 'Латиница-1 (ISO 8859-1)'],
    ['8859/2', 'Латиница-2'],
    ['8859/7', 'Греческий'],
    ['8859/6', 'Арабский'],
    ['8859/8', 'Иврит'],
    ['8859/9', 'Латиница-5'],
    ['CNS 11643-1992', 'Китайский (традиционный)'],
    ['GB 18030-2000', 'Китайский (GB18030)'],
  ].map(([value, label]) => ({ value, label })),
}

type Item = Record<string, unknown>

function list(root: unknown, path: string[]): Item[] {
  const value = getIn(root, path)
  return Array.isArray(value) ? (value as Item[]) : []
}

function ids(items: Item[], key: string, labelKey?: string): Suggestion[] {
  const result: Suggestion[] = []
  for (const item of items) {
    const value = item[key]
    if (typeof value !== 'string' || !value) continue
    const label = labelKey ? item[labelKey] : undefined
    result.push({ value, label: typeof label === 'string' ? label : undefined })
  }
  return result
}

const ARC = ['dcmDevice', 'dcmArchiveDevice']

export interface RefSources {
  /** Устройство архива — свежая версия, с несохранёнными правками, если они есть. */
  archive?: unknown
  aes?: { dicomAETitle: string; dicomDescription?: string; dicomDeviceName: string }[]
  archiveAets?: { dicomAETitle: string; dicomDescription?: string }[]
  devices?: { dicomDeviceName: string; dicomDescription?: string }[]
}

/** Собирает подсказки по форматам из конфигурации архива и справочников. */
export function buildSuggestions({ archive, aes = [], archiveAets = [], devices = [] }: RefSources): Suggestions {
  const arc = (key: string) => list(archive, [...ARC, key])
  const dev = (key: string) => list(archive, ['dcmDevice', key])
  return {
    dcmAETitle: aes.map((ae) => ({ value: ae.dicomAETitle, label: ae.dicomDescription ?? ae.dicomDeviceName })),
    dcmArchiveAETitle: archiveAets.map((ae) => ({ value: ae.dicomAETitle, label: ae.dicomDescription })),
    dicomDeviceName: devices.map((device) => ({ value: device.dicomDeviceName, label: device.dicomDescription })),
    dcmStorageID: ids(arc('dcmStorage'), 'dcmStorageID', 'dcmURI'),
    dcmQueueName: ids(arc('dcmQueue'), 'dcmQueueName', 'dicomDescription'),
    dcmExporterID: ids(arc('dcmExporter'), 'dcmExporterID', 'dcmURI'),
    dcmIDGenerator: ids(arc('dcmIDGenerator'), 'dcmIDGeneratorName', 'dcmIDGeneratorFormat'),
    dcmBulkDataDescriptorID: ids(arc('dcmBulkDataDescriptor'), 'dcmBulkDataDescriptorID'),
    dcmPDQServiceID: ids(arc('dcmPDQService'), 'dcmPDQServiceID', 'dcmURI'),
    dcmQueryRetrieveViewID: ids(arc('dcmQueryRetrieveView'), 'dcmQueryRetrieveViewID'),
    dcmAttributeSetID: ids(arc('dcmAttributeSet'), 'dcmAttributeSetID', 'dcmAttributeSetTitle'),
    dcmRejectionNoteCode: ids(arc('dcmRejectionNote'), 'dcmRejectionNoteCode', 'dcmRejectionNoteLabel'),
    dcmKeycloakClient: ids(dev('dcmKeycloakClient'), 'dcmKeycloakClientID', 'dcmURI'),
    webApp: ids(dev('dcmWebApp'), 'dcmWebAppName', 'dcmWebServicePath'),
    hl7ApplicationName: ids(dev('hl7Application'), 'hl7ApplicationName', 'dicomDescription'),
  }
}
