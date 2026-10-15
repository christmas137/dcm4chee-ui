import { useNavigate } from '@tanstack/react-router'
import type { StudiesSearch } from '../../app/searchParams'
import { modalityColor } from '../../components/Modality'
import { Segmented } from '../../components/Segmented'
import { DATE_PRESETS } from './filters'

const MODALITIES = ['CT', 'MR', 'US', 'CR', 'DX', 'MG', 'PT', 'NM', 'XA', 'SR'] as const

function useUpdate() {
  const navigate = useNavigate()
  return (patch: Partial<StudiesSearch>) =>
    void navigate({ to: '/studies', search: (prev) => ({ ...prev, ...patch }) })
}

/** Период — один из вариантов, поэтому сегментный переключатель. */
export function DateFilter({ search }: { search: StudiesSearch }) {
  const update = useUpdate()
  const active = DATE_PRESETS.find((preset) => {
    const { from, to } = preset.range()
    return from === search.from && to === search.to
  })

  return (
    <Segmented
      label="Период"
      options={DATE_PRESETS.map((preset) => ({ value: preset.label, label: preset.label }))}
      value={active?.label}
      onChange={(label) => update(DATE_PRESETS.find((preset) => preset.label === label)!.range())}
    />
  )
}

/** Модальности — можно выбрать несколько; каждая в своём цвете, как везде в интерфейсе. */
export function ModalityFilter({ search }: { search: StudiesSearch }) {
  const update = useUpdate()

  return (
    <div role="group" aria-label="Модальности" className="flex shrink-0 flex-wrap gap-1">
      {MODALITIES.map((modality) => {
        const active = search.mod?.includes(modality) ?? false
        const color = modalityColor(modality)
        return (
          <button
            key={modality}
            type="button"
            aria-pressed={active}
            onClick={() => {
              const next = active
                ? (search.mod ?? []).filter((m) => m !== modality)
                : [...(search.mod ?? []), modality]
              update({ mod: next.length ? next : undefined })
            }}
            className="flex h-6 items-center gap-1.5 rounded border px-2 text-[11px] font-semibold tracking-wide transition-colors"
            style={
              active
                ? { color, borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` }
                : { color: 'var(--color-muted)', borderColor: 'var(--color-line)' }
            }
          >
            {/* Пока фильтр выключен, он не несёт данных — и цвета у него нет. */}
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: active ? color : 'var(--color-line)' }} />
            {modality}
          </button>
        )
      })}
    </div>
  )
}
