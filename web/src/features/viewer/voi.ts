/** Окно/уровень: пресеты под модальность и подпись для оверлея. */

export interface VoiPreset {
  id: string
  label: string
  width: number
  center: number
  /** Клавиша быстрого выбора. */
  key: string
}

/** Стандартные КТ-окна, к которым рентгенологи привыкли руками. */
const CT_PRESETS: VoiPreset[] = [
  { id: 'soft', label: 'Мягкие ткани', width: 400, center: 40, key: '1' },
  { id: 'lung', label: 'Лёгкие', width: 1500, center: -600, key: '2' },
  { id: 'bone', label: 'Кости', width: 2000, center: 300, key: '3' },
  { id: 'brain', label: 'Мозг', width: 80, center: 40, key: '4' },
  { id: 'liver', label: 'Печень', width: 150, center: 60, key: '5' },
]

export function presetsFor(modality: string | undefined): VoiPreset[] {
  return modality === 'CT' ? CT_PRESETS : []
}

export function formatVoi(width: number | undefined, center: number | undefined): string {
  if (width === undefined || center === undefined) return ''
  return `Окно ${Math.round(width)}   Уровень ${Math.round(center)}`
}
