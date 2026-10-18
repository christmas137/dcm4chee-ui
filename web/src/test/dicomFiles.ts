/**
 * Настоящие DICOM-файлы для тестов загрузки: Part 10, Explicit VR Little Endian.
 * Без пикселей — для разбора заголовка и отправки они не нужны.
 */

export interface DicomFields {
  sopUID: string
  studyUID: string
  seriesUID: string
  patientName?: string
  patientID?: string
  studyDate?: string
  description?: string
  modality?: string
  /** Specific Character Set; по умолчанию UTF-8, чтобы проверять кириллицу. */
  charset?: string
}

const SECONDARY_CAPTURE = '1.2.840.10008.5.1.4.1.1.7'
const EXPLICIT_LE = '1.2.840.10008.1.2.1'

function element(group: number, elem: number, vr: string, value: Uint8Array, pad: number): Uint8Array {
  const body = value.length % 2 ? Uint8Array.from([...value, pad]) : value
  const out = new Uint8Array(8 + body.length)
  const view = new DataView(out.buffer)
  view.setUint16(0, group, true)
  view.setUint16(2, elem, true)
  out[4] = vr.charCodeAt(0)
  out[5] = vr.charCodeAt(1)
  view.setUint16(6, body.length, true)
  out.set(body, 8)
  return out
}

const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)

/** ISO 8859-5: кириллица А–я лежит в 0xB0–0xEF, сдвиг ровно 0x360 от Юникода. */
const iso88595 = (text: string) => Uint8Array.from(text, (char) => {
  const code = char.charCodeAt(0)
  return code >= 0x410 && code <= 0x44f ? code - 0x360 : code & 0xff
})

export function dicomBytes(fields: DicomFields): Uint8Array {
  const charset = fields.charset ?? 'ISO_IR 192'
  const encode = charset === 'ISO_IR 192' ? (text: string) => new TextEncoder().encode(text)
    : charset === 'ISO_IR 144' ? iso88595
      : latin1
  const ui = (group: number, elem: number, uid: string) => element(group, elem, 'UI', latin1(uid), 0)
  const str = (group: number, elem: number, vr: string, value: string | undefined, enc = latin1) =>
    value === undefined ? [] : [element(group, elem, vr, enc(value), 0x20)]

  const parts: Uint8Array[] = [
    new Uint8Array(128),
    latin1('DICM'),
    ui(0x0002, 0x0002, SECONDARY_CAPTURE),
    ui(0x0002, 0x0003, fields.sopUID),
    ui(0x0002, 0x0010, EXPLICIT_LE),
    ...str(0x0008, 0x0005, 'CS', charset),
    ui(0x0008, 0x0016, SECONDARY_CAPTURE),
    ui(0x0008, 0x0018, fields.sopUID),
    ...str(0x0008, 0x0020, 'DA', fields.studyDate),
    ...str(0x0008, 0x0060, 'CS', fields.modality),
    ...str(0x0008, 0x1030, 'LO', fields.description, encode),
    ...str(0x0010, 0x0010, 'PN', fields.patientName, encode),
    ...str(0x0010, 0x0020, 'LO', fields.patientID ?? 'P1', encode),
    ui(0x0020, 0x000d, fields.studyUID),
    ui(0x0020, 0x000e, fields.seriesUID),
  ]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function dicomFile(name: string, fields: DicomFields): File {
  return new File([dicomBytes(fields) as Uint8Array<ArrayBuffer>], name, { type: 'application/dicom' })
}

/** Исследование из `count` снимков одной серии. */
export function studyFiles(prefix: string, count: number, extra: Partial<DicomFields> = {}): File[] {
  return Array.from({ length: count }, (_, index) => dicomFile(`${prefix}-${index + 1}.dcm`, {
    studyUID: `1.2.826.0.1.${prefix.length}.${prefix.charCodeAt(0)}`,
    seriesUID: `1.2.826.0.1.${prefix.length}.${prefix.charCodeAt(0)}.1`,
    sopUID: `1.2.826.0.1.${prefix.length}.${prefix.charCodeAt(0)}.1.${index + 1}`,
    patientName: 'Иванов^Иван',
    patientID: 'P1',
    studyDate: '20261018',
    description: 'КТ грудной клетки',
    modality: 'CT',
    ...extra,
  }))
}
