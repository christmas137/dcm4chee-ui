/**
 * Модальность — единственное, что в интерфейсе имеет собственный цвет. Один и тот же цвет
 * в списке, в фильтрах, в строке запроса и в панели: CT узнаётся раньше, чем читается.
 */

const GROUPS: Record<string, string> = {
  CT: 'ct',
  MR: 'mr',
  US: 'us',
  CR: 'xr', DX: 'xr', DR: 'xr', RG: 'xr', PX: 'xr', IO: 'xr',
  MG: 'mg',
  PT: 'nm', NM: 'nm',
  XA: 'xa', RF: 'xa', ES: 'xa',
}

export function modalityColor(modality: string): string {
  return `var(--color-mod-${GROUPS[modality.toUpperCase()] ?? 'doc'})`
}

export function ModalityTag({ modality }: { modality: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide"
      style={{ color: modalityColor(modality) }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: modalityColor(modality) }} />
      {modality}
    </span>
  )
}

export function ModalityList({ modalities }: { modalities: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {modalities.map((modality) => <ModalityTag key={modality} modality={modality} />)}
    </span>
  )
}
