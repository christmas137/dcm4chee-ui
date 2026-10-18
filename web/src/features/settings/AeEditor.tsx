import { useState } from 'react'
import {
  aeConnections, connectionRef, describeConnection, useDevice, useDeleteDevice, useSaveDevice,
} from '../../api/devices'
import type { Device, NetworkAE } from '../../api/devices'
import { Button, Checkbox, Field, TextInput } from '../../components/form'
import { JsonEditor } from '../../components/JsonEditor'
import { Segmented } from '../../components/Segmented'
import { ErrorBox, Spinner } from '../../components/ui'
import { EDITOR_VIEWS } from './editorViews'
import type { EditorView } from './editorViews'
import { SchemaEditor } from './schema/SchemaEditor'
import { TransferCapabilities } from './TransferCapabilities'

interface Props {
  deviceName: string
  aeTitle: string
  onChanged(): void
  onClose(): void
  /** Полный список параметров просит панель пошире. */
  onWideChange?(wide: boolean): void
}

/** Редактор одного AE. Сохранение — целым устройством, как того требует API конфигурации. */
export function AeEditor({ deviceName, aeTitle, onChanged, onClose, onWideChange }: Props) {
  const device = useDevice(deviceName)
  const save = useSaveDevice()
  const removeDevice = useDeleteDevice()
  const [draft, setDraft] = useState<NetworkAE | null>(null)
  const [view, setView] = useState<EditorView>('main')
  // Сброс правок пересоздаёт формы: у полей бывает своё локальное состояние.
  const [revision, setRevision] = useState(0)

  function switchView(next: EditorView) {
    setView(next)
    onWideChange?.(next === 'all')
  }

  function discard() {
    setDraft(null)
    setRevision((value) => value + 1)
  }

  if (device.isPending) return <div className="p-4"><Spinner /></div>
  if (device.error) return <ErrorBox error={device.error as Error} retry={() => void device.refetch()} />

  const loaded = device.data!
  const original = loaded.dicomNetworkAE?.find((ae) => ae.dicomAETitle === aeTitle)
  if (!original) {
    return <div className="p-4 text-[12px] text-danger">AE «{aeTitle}» больше нет в устройстве {deviceName}.</div>
  }

  const ae = draft ?? original
  const connections = loaded.dicomNetworkConnection ?? []
  const selectedRefs = new Set(ae.dicomNetworkConnectionReference ?? [])
  const dirty = draft !== null
  const isLastAe = (loaded.dicomNetworkAE?.length ?? 0) === 1

  function patch(changes: Partial<NetworkAE>) {
    setDraft({ ...ae, ...changes })
  }

  function toggleConnection(index: number, checked: boolean) {
    const ref = connectionRef(index)
    const refs = new Set(ae.dicomNetworkConnectionReference ?? [])
    if (checked) refs.add(ref)
    else refs.delete(ref)
    patch({ dicomNetworkConnectionReference: [...refs].sort() })
  }

  function persist(nextAeList: NetworkAE[]) {
    const next: Device = { ...loaded, dicomNetworkAE: nextAeList }
    save.mutate(next, {
      onSuccess: () => {
        discard()
        onChanged()
      },
    })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-medium">{aeTitle}</p>
          <p className="truncate text-[11px] text-muted">устройство {deviceName}</p>
        </div>
        <Button tone="primary" disabled={!dirty || save.isPending} onClick={() => persist(
          (loaded.dicomNetworkAE ?? []).map((item) => (item.dicomAETitle === aeTitle ? ae : item)),
        )}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button disabled={!dirty} onClick={discard}>Отменить</Button>
        <Button onClick={() => { onWideChange?.(false); onClose() }} aria-label="Закрыть">✕</Button>
      </header>

      <div className="border-b border-line px-3 py-1.5">
        <Segmented asTabs size="sm" label="Вид редактора" options={EDITOR_VIEWS} value={view} onChange={switchView} />
      </div>
      {save.error && <ErrorBox error={save.error as Error} />}

      {view === 'all' ? (
        <SchemaEditor
          key={revision}
          root={ae}
          original={original}
          onChange={(next) => setDraft(next as NetworkAE)}
          base={{ kind: 'object', path: [], schema: 'networkAE.schema.json', label: aeTitle }}
          // Привязка к соединениям — ссылками `/dicomNetworkConnection/N`; удобно она правится на «Основном».
          include={(field) => field.key !== 'dicomNetworkConnectionReference'}
        />
      ) : view === 'json' ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <JsonEditor key={revision} label="JSON AE" value={ae} onChange={(next) => setDraft(next as NetworkAE)} rows={30} />
        </div>
      ) : (
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">

        <div className="grid grid-cols-2 gap-3">
          <Field label="AE Title" hint="до 16 символов, без пробелов">
            <TextInput
              value={ae.dicomAETitle}
              maxLength={16}
              onChange={(event) => patch({ dicomAETitle: event.target.value.trim() })}
            />
          </Field>
          <Field label="Описание">
            <TextInput
              value={ae.dicomDescription ?? ''}
              onChange={(event) => patch({ dicomDescription: event.target.value || undefined })}
            />
          </Field>
        </div>

        <section className="space-y-1.5">
          <p className="text-[11px] text-muted">Роль в ассоциации</p>
          <div className="flex gap-4">
            <Checkbox
              label={<>Инициатор <span className="text-muted">(исходящие запросы)</span></>}
              checked={ae.dicomAssociationInitiator ?? false}
              onChange={(checked) => patch({ dicomAssociationInitiator: checked })}
            />
            <Checkbox
              label={<>Акцептор <span className="text-muted">(входящие)</span></>}
              checked={ae.dicomAssociationAcceptor ?? false}
              onChange={(checked) => patch({ dicomAssociationAcceptor: checked })}
            />
          </div>
        </section>

        <section className="space-y-1.5">
          <p className="text-[11px] text-muted">
            Сетевые соединения устройства {connections.length === 0 && '— у устройства их нет'}
          </p>
          <div className="space-y-1">
            {connections.map((connection, index) => (
              <Checkbox
                key={`${connection.cn ?? index}`}
                checked={selectedRefs.has(connectionRef(index))}
                onChange={(checked) => toggleConnection(index, checked)}
                label={
                  <span>
                    <span className="font-mono">{describeConnection(connection)}</span>
                    {connection.cn && <span className="ml-2 text-muted">{connection.cn}</span>}
                  </span>
                }
              />
            ))}
          </div>
          {aeConnections(loaded, ae).length === 0 && (
            <p className="text-[10px] text-warn">AE без соединения работать не будет.</p>
          )}
        </section>

        <TransferCapabilities
          items={ae.dicomTransferCapability ?? []}
          onChange={(items) => patch({ dicomTransferCapability: items })}
        />

        <section className="space-y-1.5 border-t border-line pt-3">
          <p className="text-[11px] text-muted">Опасная зона</p>
          <div className="flex gap-2">
            <Button
              tone="danger"
              disabled={save.isPending}
              onClick={() => {
                if (!confirm(`Удалить AE ${aeTitle} из устройства ${deviceName}?`)) return
                persist((loaded.dicomNetworkAE ?? []).filter((item) => item.dicomAETitle !== aeTitle))
              }}
            >
              Удалить AE
            </Button>
            {isLastAe && (
              <Button
                tone="danger"
                disabled={removeDevice.isPending}
                onClick={() => {
                  if (!confirm(`Удалить устройство ${deviceName} целиком?`)) return
                  removeDevice.mutate(deviceName, { onSuccess: () => { onChanged(); onClose() } })
                }}
              >
                Удалить устройство целиком
              </Button>
            )}
          </div>
          {removeDevice.error && <ErrorBox error={removeDevice.error as Error} />}
        </section>
      </div>
      )}
    </div>
  )
}
