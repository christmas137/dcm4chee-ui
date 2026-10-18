import { useMemo, useState } from 'react'
import { useDevice, useDevices, useSaveDevice } from '../../api/devices'
import type { Device } from '../../api/devices'
import { Button, TextInput } from '../../components/form'
import { ErrorBox, Spinner } from '../../components/ui'
import { extraSections, SECTIONS, sectionItems, sectionSchema } from './archiveSections'
import type { SectionDef } from './archiveSections'
import { fieldTitle, matchesQuery } from './schema/fields'
import { collectFields } from './schema/model'
import { ConfigRefsProvider } from './schema/ConfigRefsProvider'
import { SchemaEditor } from './schema/SchemaEditor'
import { THEMES, themeOf } from './schema/themes'
import { getIn, isEmptyValue, setIn } from './schema/values'
import { SectionEditor } from './SectionEditor'

/** Псевдораздел одиночных параметров архива: `params` — все, `params:<тема>` — одна тема. */
export const PARAMS_SECTION = 'params'

const ARCHIVE_SCHEMA = 'archiveDevice.schema.json'
const ARC_PATH = ['dcmDevice', 'dcmArchiveDevice']

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
  // С каким запросом открыть параметры, когда их нашли поиском в навигаторе.
  const [paramsQuery, setParamsQuery] = useState('')

  function discard() {
    setDraft(null)
    setRevision((value) => value + 1)
  }

  const current = draft ?? device.data
  const dirty = draft !== null
  // Одиночные параметры архива — всё, кроме списков записей (у тех свои разделы).
  const params = useMemo(() => collectFields(ARCHIVE_SCHEMA).fields, [])

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

  const foundParams = useMemo(
    () => (filter.trim() ? params.filter((field) => matchesQuery(field, filter)) : []),
    [params, filter],
  )

  if (devices.isPending || device.isPending) return <div className="p-4"><Spinner /></div>
  if (device.error) return <ErrorBox error={device.error as Error} retry={() => void device.refetch()} />
  if (!current) return <ErrorBox error={new Error('Не найдено устройство с расширением архива')} />

  const theme = section?.startsWith(`${PARAMS_SECTION}:`) ? section.slice(PARAMS_SECTION.length + 1) : undefined
  const isParams = section === PARAMS_SECTION || theme !== undefined
  const active = isParams ? undefined : allSections.find((item) => item.path.join('/') === section)
  const arc = getIn(current, ARC_PATH)
  const setCount = (themeId?: string) =>
    params.filter((field) => (!themeId || themeOf(field.key) === themeId) && !isEmptyValue(getIn(arc, field.path))).length

  const navItem = (key: string, label: string, count: string | number, indent = false) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        setParamsQuery('')
        onSelectSection(key)
      }}
      className={`flex w-full items-center gap-2 py-1 pr-3 text-left text-[12px] ${indent ? 'pl-5' : 'pl-3'} ${
        section === key ? 'bg-accent/15 text-accent' : 'hover:bg-panel-2'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>{' '}
      <span className={count ? 'text-muted' : 'text-muted/50'}>{count}</span>
    </button>
  )

  return (
    <ConfigRefsProvider archiveDraft={current}>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Разделы конфигурации" className="flex w-64 shrink-0 flex-col border-r border-line">
          <div className="border-b border-line p-2">
            <TextInput
              placeholder="Раздел или параметр…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {foundParams.length > 0 && (
              <div className="mb-2 border-b border-line pb-2">
                <p className="px-3 pt-1 pb-0.5 text-[11.5px] font-semibold text-muted">
                  Параметры архива · найдено {foundParams.length}
                </p>
                {foundParams.slice(0, 8).map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => {
                      setParamsQuery(field.key)
                      onSelectSection(`${PARAMS_SECTION}:${themeOf(field.key)}`)
                    }}
                    className="block w-full truncate px-3 py-1 text-left text-[12px] hover:bg-panel-2"
                  >
                    {fieldTitle(field)}
                  </button>
                ))}
                {foundParams.length > 8 && (
                  <button
                    type="button"
                    onClick={() => {
                      setParamsQuery(filter)
                      onSelectSection(PARAMS_SECTION)
                    }}
                    className="block w-full px-3 py-1 text-left text-[12px] text-muted hover:bg-panel-2 hover:text-fg"
                  >
                    Показать все {foundParams.length} →
                  </button>
                )}
              </div>
            )}

            {!filter && (
              <div>
                <p className="px-3 pt-1 pb-0.5 text-[11.5px] font-semibold text-muted">Параметры архива</p>
                {navItem(PARAMS_SECTION, 'Все параметры', `${setCount()}/${params.length}`)}
                {THEMES.map((item) => navItem(`${PARAMS_SECTION}:${item.id}`, item.label, setCount(item.id), true))}
              </div>
            )}

            {groups.map(([group, items]) => (
              <div key={group} className="mt-2">
                <p className="px-3 pt-1 pb-0.5 text-[11.5px] font-semibold text-muted">{group}</p>
                {items.map((item) => navItem(
                  item.path.join('/'),
                  item.label,
                  item.single ? (getIn(current, item.path) ? '•' : '') : sectionItems(current, item).length,
                ))}
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

          {isParams ? (
            <SchemaEditor
              key={`${section}#${revision}#${paramsQuery}`}
              root={current}
              original={device.data}
              onChange={(next) => setDraft(next as Device)}
              base={{
                kind: 'object', path: ARC_PATH, schema: ARCHIVE_SCHEMA,
                label: theme ? THEMES.find((item) => item.id === theme)?.label ?? theme : 'Параметры архива',
              }}
              include={(field) => field.kind.kind !== 'list' && (!theme || themeOf(field.key) === theme)}
              unknown={theme ? 'none' : 'scalars'}
              initialQuery={paramsQuery}
            />
          ) : active ? (
            <SectionView
              key={`${active.path.join('/')}#${revision}`}
              section={active}
              device={current}
              original={device.data}
              onChange={(next) => setDraft(next)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-muted">
              <div>
                <p>Выберите раздел слева.</p>
                <p className="mt-1 text-[11px]">
                  Здесь вся конфигурация архива: {params.length} параметров и {allSections.length} разделов.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </ConfigRefsProvider>
  )
}

/** Раздел-список: записи формами по схеме. Раздел без схемы (из новой версии архива) — JSON. */
function SectionView({ section, device, original, onChange }: {
  section: SectionDef
  device: Device
  original?: Device
  onChange(next: Device): void
}) {
  const schema = sectionSchema(section)
  if (!schema) {
    return (
      <SectionEditor
        section={section}
        items={sectionItems(device, section)}
        onChange={(items) => onChange(setIn(device, section.path, items))}
      />
    )
  }
  return (
    <SchemaEditor
      root={device}
      original={original}
      onChange={(next) => onChange(next as Device)}
      base={section.single
        ? { kind: 'object', path: section.path, schema: schema.ref, label: section.label }
        : {
            kind: 'list', path: section.path, schema: schema.ref, label: section.label, titleKey: schema.titleKey,
            description: section.hint, columns: section.columns?.slice(1).map((column) => column.key),
          }}
    />
  )
}
