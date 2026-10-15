import { useMemo, useState } from 'react'
import { useDevice, useDevices, useSaveDevice } from '../../api/devices'
import type { Device } from '../../api/devices'
import { Button, TextInput } from '../../components/form'
import { ErrorBox, Spinner } from '../../components/ui'
import { extraSections, SECTIONS, sectionItems, setAtPath } from './archiveSections'
import type { SectionDef } from './archiveSections'
import { ScalarSettings } from './ScalarSettings'
import { SectionEditor } from './SectionEditor'

/** Псевдораздел для одиночных параметров: в дереве конфигурации своего узла у них нет. */
export const SCALARS_SECTION = 'scalars'

/** Настройки самого архива: всё, что живёт внутри dcmArchiveDevice и служб устройства. */
export function ArchiveTab({
  section, onSelectSection, onChanged,
}: {
  section?: string
  onSelectSection(section: string | undefined): void
  onChanged(): void
}) {
  const devices = useDevices()
  const archiveName = devices.data?.find((item) => item.hasArcDevExt)?.dicomDeviceName
  const device = useDevice(archiveName)
  const save = useSaveDevice()
  const [draft, setDraft] = useState<Device | null>(null)
  const [filter, setFilter] = useState('')
  // Сброс или сохранение пересоздаёт редакторы: у полей бывает своё локальное состояние.
  const [revision, setRevision] = useState(0)

  function discard() {
    setDraft(null)
    setRevision((value) => value + 1)
  }

  const current = draft ?? device.data
  const dirty = draft !== null

  const allSections = useMemo(
    () => (current ? [...SECTIONS, ...extraSections(current)] : SECTIONS),
    [current],
  )

  const groups = useMemo(() => {
    const needle = filter.toLowerCase()
    const result = new Map<string, SectionDef[]>()
    for (const item of allSections) {
      if (needle && !`${item.label} ${item.path.join(' ')}`.toLowerCase().includes(needle)) continue
      const list = result.get(item.group) ?? []
      list.push(item)
      result.set(item.group, list)
    }
    return [...result.entries()]
  }, [allSections, filter])

  if (devices.isPending || device.isPending) return <div className="p-4"><Spinner /></div>
  if (device.error) return <ErrorBox error={device.error as Error} retry={() => void device.refetch()} />
  if (!current) return <ErrorBox error={new Error('Не найдено устройство с расширением архива')} />

  const active = section === SCALARS_SECTION
    ? undefined
    : allSections.find((item) => item.path.join('/') === section)

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Разделы конфигурации" className="flex w-64 shrink-0 flex-col border-r border-line">
        <div className="border-b border-line p-2">
          <TextInput
            placeholder="Раздел…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          <button
            type="button"
            onClick={() => onSelectSection(SCALARS_SECTION)}
            className={`block w-full px-3 py-1 text-left text-[12px] ${
              section === SCALARS_SECTION ? 'bg-accent/15 text-accent' : 'hover:bg-panel-2'
            }`}
          >
            Параметры архива
          </button>
          {groups.map(([group, items]) => (
            <div key={group} className="mt-2">
              <p className="px-3 pt-1 pb-0.5 text-[11.5px] font-semibold text-muted">{group}</p>
              {items.map((item) => {
                const key = item.path.join('/')
                const count = sectionItems(current, item).length
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectSection(key)}
                    className={`flex w-full items-center gap-2 px-3 py-1 text-left text-[12px] ${
                      section === key ? 'bg-accent/15 text-accent' : 'hover:bg-panel-2'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>{' '}
                    <span className={count ? 'text-muted' : 'text-muted/50'}>{count}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          <span className="flex-1 truncate text-[11px] text-muted">
            устройство {current.dicomDeviceName}
            {dirty && <span className="ml-2 text-warn">есть несохранённые правки</span>}
          </span>
          <Button tone="primary" disabled={!dirty || save.isPending} onClick={() =>
            save.mutate(current, { onSuccess: () => { discard(); onChanged() } })}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button disabled={!dirty} onClick={discard}>Отменить</Button>
        </div>

        {save.error && <ErrorBox error={save.error as Error} />}

        {section === SCALARS_SECTION ? (
          <ScalarSettings
            key={revision}
            device={current}
            onChange={(key, value) =>
              setDraft(setAtPath(current, ['dcmDevice', 'dcmArchiveDevice', key], value))}
          />
        ) : active ? (
          <SectionEditor
            key={`${active.path.join('/')}#${revision}`}
            section={active}
            items={sectionItems(current, active)}
            onChange={(items) => setDraft(setAtPath(current, active.path, items))}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-muted">
            <div>
              <p>Выберите раздел слева.</p>
              <p className="mt-1 text-[11px]">
                Здесь вся конфигурация архива — {allSections.length} разделов.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
