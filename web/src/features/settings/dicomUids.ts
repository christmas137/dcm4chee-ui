/** Имена для самых ходовых UID — чтобы в списке возможностей не было голых цифр. */

export const TRANSFER_SYNTAX_NAMES: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR LE',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS Lossy',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.4.100': 'MPEG2',
  '1.2.840.10008.1.2.4.102': 'H.264 HP',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
}

/** Набор по умолчанию для нового внешнего узла: несжатые синтаксисы принимают все. */
export const DEFAULT_TRANSFER_SYNTAXES = ['1.2.840.10008.1.2', '1.2.840.10008.1.2.1']

export const VERIFICATION_SOP_CLASS = '1.2.840.10008.1.1'

export function transferSyntaxName(uid: string): string {
  return TRANSFER_SYNTAX_NAMES[uid] ?? uid
}

/** Классы хранения снимков (PS3.4 B.5): всё, что архив отправляет C-STORE-ом. */
export function isStorageSOPClass(uid: string | undefined): boolean {
  return Boolean(uid?.startsWith('1.2.840.10008.5.1.4.1.1.'))
}
