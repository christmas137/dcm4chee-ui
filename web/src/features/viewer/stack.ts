/**
 * Стек снимков серии для вьюера: порядок срезов, адреса кадров, тип серии.
 * Чистые функции — всё, что вьюер решает о данных, проверяется юнит-тестами.
 */
import type { DicomJson } from '../../api/dicom'
import { num, str, Tag } from '../../api/dicom'
import { ARCHIVE_BASE } from '../../api/client'
import { instancePath } from '../../api/series'

export interface StackInstance {
  sopUID: string
  sopClassUID?: string
  number?: number
  frames: number
  /** ImagePositionPatient — где срез в пространстве пациента. */
  position?: number[]
  /** ImageOrientationPatient — направления строк и столбцов. */
  orientation?: number[]
}

function numbers(ds: DicomJson, tag: string): number[] | undefined {
  const values = ds[tag]?.Value
  if (!values?.length) return undefined
  const parsed = values.map(Number)
  return parsed.every(Number.isFinite) ? parsed : undefined
}

export function toStackInstance(ds: DicomJson): StackInstance {
  return {
    sopUID: str(ds, Tag.SOPInstanceUID) ?? '',
    sopClassUID: str(ds, Tag.SOPClassUID),
    number: num(ds, Tag.InstanceNumber),
    frames: Math.max(1, num(ds, '00280008') ?? 1),
    position: numbers(ds, '00200032'),
    orientation: numbers(ds, '00200037'),
  }
}

/** Проекция позиции среза на нормаль к его плоскости — «глубина» среза вдоль серии. */
function depth(instance: StackInstance): number | undefined {
  const { position: p, orientation: o } = instance
  if (!p || p.length !== 3 || !o || o.length !== 6) return undefined
  const normal = [o[1] * o[5] - o[2] * o[4], o[2] * o[3] - o[0] * o[5], o[0] * o[4] - o[1] * o[3]]
  return p[0] * normal[0] + p[1] * normal[1] + p[2] * normal[2]
}

/**
 * Порядок срезов. Правильный — по положению в пространстве: InstanceNumber бывает
 * перепутан, продублирован или вовсе отсутствует. Если геометрии нет хоть у одного снимка —
 * по InstanceNumber, а без него — как пришло.
 */
export function sortStack(instances: StackInstance[]): StackInstance[] {
  const depths = instances.map(depth)
  if (instances.length > 1 && depths.every((d) => d !== undefined)) {
    return instances
      .map((instance, index) => ({ instance, d: depths[index]!, index }))
      .sort((a, b) => a.d - b.d || a.index - b.index)
      .map((item) => item.instance)
  }
  return instances
    .map((instance, index) => ({ instance, index }))
    .sort((a, b) => (a.instance.number ?? Infinity) - (b.instance.number ?? Infinity) || a.index - b.index)
    .map((item) => item.instance)
}

/** Абсолютный адрес архива: загрузчик cornerstone ходит XHR-ом и в воркерах относительным не верит. */
export function archiveOrigin(): string {
  return ARCHIVE_BASE.startsWith('http') ? ARCHIVE_BASE : `${window.location.origin}${ARCHIVE_BASE}`
}

/** imageId для загрузчика: `wadors:<адрес снимка>/frames/<кадр>`; многокадровые разворачиваются. */
export function wadorsImageIds(base: string, aet: string, studyUID: string, seriesUID: string, instances: StackInstance[]): string[] {
  return instances.flatMap((instance) =>
    Array.from({ length: instance.frames }, (_, frame) =>
      `wadors:${base}${instancePath(aet, studyUID, seriesUID, instance.sopUID)}/frames/${frame + 1}`))
}

export type SeriesKind = 'image' | 'pdf' | 'report' | 'other'

const PDF = '1.2.840.10008.5.1.4.1.1.104.1'
const SR_PREFIX = '1.2.840.10008.5.1.4.1.1.88.' // SR и Key Object Selection
const PRESENTATION_STATE_PREFIX = '1.2.840.10008.5.1.4.1.1.11.'

/** Что за серия: картинки во вьюер, PDF — как документ, SR/KO — как отчёт, прочее — метаданными. */
export function classifySeries(modality?: string, sopClassUID?: string): SeriesKind {
  if (sopClassUID === PDF || modality === 'DOC') return 'pdf'
  if (sopClassUID?.startsWith(SR_PREFIX) || modality === 'SR' || modality === 'KO') return 'report'
  if (sopClassUID?.startsWith(PRESENTATION_STATE_PREFIX) || modality === 'PR') return 'other'
  return 'image'
}

const UNCOMPRESSED = 'multipart/related; type=application/octet-stream; transfer-syntax=*'

/**
 * Медиатип кадра для WADO-RS по синтаксису хранения. Без него dcm4chee отдаёт кадры
 * несжатыми и разжимает их сам: для JPEG 2000 это вдвое больше трафика плюс процессор сервера.
 * Просим родной формат, а несжатый — запасным вариантом, если архив не сможет.
 *
 * RLE сознательно не просим: dcm4chee отвечает `image/dicom-rle` без transfer-syntax, а загрузчик
 * cornerstone знает только нестандартное `image/x-dicom-rle` — и декодировал бы кадр как несжатый.
 */
const COMPRESSED_TYPES: Record<string, string> = {
  '1.2.840.10008.1.2.4.50': 'image/jpeg',
  '1.2.840.10008.1.2.4.51': 'image/jpeg',
  '1.2.840.10008.1.2.4.57': 'image/jll',
  '1.2.840.10008.1.2.4.70': 'image/jll',
  '1.2.840.10008.1.2.4.80': 'image/jls',
  '1.2.840.10008.1.2.4.81': 'image/jls',
  '1.2.840.10008.1.2.4.90': 'image/jp2',
  '1.2.840.10008.1.2.4.91': 'image/jp2',
  '1.2.840.10008.1.2.4.201': 'image/jphc',
  '1.2.840.10008.1.2.4.202': 'image/jphc',
  '1.2.840.10008.1.2.4.203': 'image/jphc',
}

export function frameAccept(transferSyntax: string | undefined): string {
  const type = transferSyntax ? COMPRESSED_TYPES[transferSyntax] : undefined
  return type ? `multipart/related; type="${type}"; transfer-syntax=${transferSyntax}, ${UNCOMPRESSED}` : UNCOMPRESSED
}
