import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useReloadConfig } from '../../api/devices'
import { Button } from '../../components/form'
import { Segmented } from '../../components/Segmented'
import { AeEditor } from './AeEditor'
import { ArchiveTab } from './ArchiveTab'
import { AeList } from './AeList'
import { DeviceEditor } from './DeviceEditor'
import { DeviceList } from './DeviceList'
import { NewDeviceDialog } from './NewDeviceDialog'
import { ConfigRefsProvider } from './schema/ConfigRefsProvider'

const TABS = [
  { key: 'ae', label: 'AE-титлы' },
  { key: 'devices', label: 'Устройства' },
  { key: 'archive', label: 'Настройки архива' },
] as const

export function SettingsPage() {
  const search = useSearch({ from: '/settings' })
  const navigate = useNavigate()
  const reload = useReloadConfig()
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  // Полный список параметров AE или устройства не помещается в узкую панель.
  // Запоминаем, для какого редактора панель расширили: у следующего она снова обычная.
  const [wideFor, setWideFor] = useState<string | null>(null)

  const tab = search.tab ?? 'ae'

  function update(patch: Partial<typeof search>) {
    void navigate({ to: '/settings', search: (prev) => ({ ...prev, ...patch }) })
  }

  const editing = search.ae && search.device
    ? { kind: 'ae' as const, device: search.device, ae: search.ae }
    : search.device
      ? { kind: 'device' as const, device: search.device }
      : null
  const editingKey = editing && (editing.kind === 'ae' ? `${editing.device}/${editing.ae}` : editing.device)
  const wide = editingKey !== null && wideFor === editingKey
  const setWide = (value: boolean) => setWideFor(value ? editingKey : null)

  return (
    <ConfigRefsProvider>
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <Segmented
          label="Раздел конфигурации"
          options={TABS.map((item) => ({ value: item.key, label: item.label }))}
          value={tab}
          onChange={(key) => update({ tab: key, device: undefined, ae: undefined })}
        />
        <div className="flex-1" />
        {tab !== 'archive' && (
          <Button tone="primary" onClick={() => setCreating(true)}>+ Новое подключение</Button>
        )}
      </div>

      {/* Конфигурация записана, но работающий архив ещё живёт со старой — без reload изменения не вступят в силу. */}
      {dirty && (
        <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-[11px] text-warn">
          <span>Конфигурация изменена. Чтобы архив её подхватил, перечитайте конфигурацию.</span>
          <Button
            disabled={reload.isPending}
            onClick={() => reload.mutate(undefined, { onSuccess: () => setDirty(false) })}
          >
            {reload.isPending ? 'Применяем…' : 'Применить'}
          </Button>
          {reload.error && <span className="text-danger">{(reload.error as Error).message}</span>}
        </div>
      )}

      {tab === 'archive' ? (
        <ArchiveTab
          section={search.section}
          onSelectSection={(section) => update({ section })}
          onChanged={() => setDirty(true)}
        />
      ) : (
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {tab === 'ae' ? (
            <AeList
              selected={search.ae && search.device ? { device: search.device, ae: search.ae } : undefined}
              onSelect={(ae) => update({ device: ae.dicomDeviceName, ae: ae.dicomAETitle })}
            />
          ) : (
            <DeviceList
              selected={search.device}
              onSelect={(device) => update({ device, ae: undefined })}
            />
          )}
        </div>

        {editing && (
          <aside
            className={`flex shrink-0 flex-col border-l border-line bg-panel ${wide ? 'w-[min(960px,70vw)]' : 'w-[560px]'}`}
          >
            {editing.kind === 'ae' ? (
              <AeEditor
                key={`${editing.device}/${editing.ae}`}
                deviceName={editing.device}
                aeTitle={editing.ae}
                onChanged={() => setDirty(true)}
                onClose={() => update({ device: undefined, ae: undefined })}
                onWideChange={setWide}
              />
            ) : (
              <DeviceEditor
                key={editing.device}
                deviceName={editing.device}
                onChanged={() => setDirty(true)}
                onClose={() => update({ device: undefined, ae: undefined })}
                onOpenAe={(aeTitle) => update({ tab: 'ae', ae: aeTitle })}
                onWideChange={setWide}
              />
            )}
          </aside>
        )}
      </div>
      )}

      {creating && (
        <NewDeviceDialog
          onClose={() => setCreating(false)}
          onCreated={(device, ae) => {
            setCreating(false)
            setDirty(true)
            update({ tab: 'ae', device, ae })
          }}
        />
      )}
    </div>
    </ConfigRefsProvider>
  )
}
