import { useNavigate } from '@tanstack/react-router'
import type { StudiesSearch } from '../../app/router'
import { DATE_PRESETS } from './filters'

const MODALITIES = ['CT', 'MR', 'US', 'CR', 'DX', 'MG', 'PT', 'NM', 'XA', 'SR'] as const

function chipClass(active: boolean): string {
  return [
    'h-6 rounded-full border px-2.5 text-[11px] transition-colors',
    active
      ? 'border-accent bg-accent/15 text-accent'
      : 'border-line bg-panel text-muted hover:text-fg',
  ].join(' ')
}

export function FilterBar({ search }: { search: StudiesSearch }) {
  const navigate = useNavigate()

  function update(patch: Partial<StudiesSearch>) {
    void navigate({ to: '/studies', search: (prev) => ({ ...prev, ...patch }) })
  }

  const activePreset =
    DATE_PRESETS.find((preset) => {
      const { from, to } = preset.range()
      return from === search.from && to === search.to
    }) ?? null

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel px-3 py-2">
      {DATE_PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          className={chipClass(activePreset?.label === preset.label)}
          onClick={() => update(preset.range())}
        >
          {preset.label}
        </button>
      ))}

      <span className="mx-1 h-4 w-px bg-line" />

      {MODALITIES.map((modality) => {
        const active = search.mod?.includes(modality) ?? false
        return (
          <button
            key={modality}
            type="button"
            className={chipClass(active)}
            onClick={() => {
              const next = active
                ? (search.mod ?? []).filter((m) => m !== modality)
                : [...(search.mod ?? []), modality]
              update({ mod: next.length ? next : undefined })
            }}
          >
            {modality}
          </button>
        )
      })}
    </div>
  )
}
