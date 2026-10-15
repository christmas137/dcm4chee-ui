import { useState } from 'react'
import { useDevice, useDeleteDevice, useSaveDevice } from '../../api/devices'
import type { Device, NetworkConnection } from '../../api/devices'
import { Button, Checkbox, Field, TextInput } from '../../components/form'
import { JsonEditor } from '../../components/JsonEditor'
import { ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'

const TLS_CIPHERS = ['TLS_RSA_WITH_AES_128_CBC_SHA', 'SSL_RSA_WITH_3DES_EDE_CBC_SHA']

interface Props {
  deviceName: string
  onChanged(): void
  onClose(): void
  onOpenAe(aeTitle: string): void
}

/** Устройство целиком: сетевые соединения, список AE и — для полноты — сырой JSON. */
export function DeviceEditor({ deviceName, onChanged, onClose, onOpenAe }: Props) {
  const device = useDevice(deviceName)
  const save = useSaveDevice()
  const remove = useDeleteDevice()
  const [draft, setDraft] = useState<Device | null>(null)
  const [showJson, setShowJson] = useState(false)

  if (device.isPending) return <div className="p-4"><Spinner /></div>
  if (device.error) return <ErrorBox error={device.error as Error} retry={() => void device.refetch()} />

  const current = draft ?? device.data!
  const connections = current.dicomNetworkConnection ?? []
  const dirty = draft !== null
  // Конфигурация самого архива — это десятки тысяч строк JSON, редактор её не потянет с толком.
  const jsonTooBig = JSON.stringify(current).length > 200_000

  function patch(changes: Partial<Device>) {
    setDraft({ ...current, ...changes })
  }

  function patchConnection(index: number, changes: Partial<NetworkConnection>) {
    patch({
      dicomNetworkConnection: connections.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{current.dicomDeviceName}</p>
          <p className="truncate text-[11px] text-muted">
            {countLabel(connections.length, 'соединение', 'соединения', 'соединений')}, {current.dicomNetworkAE?.length ?? 0} AE
          </p>
        </div>
        <Button tone="primary" disabled={!dirty || save.isPending} onClick={() =>
          save.mutate(current, { onSuccess: () => { setDraft(null); onChanged() } })}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button disabled={!dirty} onClick={() => setDraft(null)}>Отменить</Button>
        <Button onClick={onClose} aria-label="Закрыть">✕</Button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {save.error && <ErrorBox error={save.error as Error} />}

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Описание">
            <TextInput
              value={current.dicomDescription ?? ''}
              onChange={(event) => patch({ dicomDescription: event.target.value || undefined })}
            />
          </Field>
          <Checkbox
            label="Установлено"
            checked={current.dicomInstalled ?? false}
            onChange={(checked) => patch({ dicomInstalled: checked })}
          />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted">Сетевые соединения</p>
            <Button onClick={() => patch({
              dicomNetworkConnection: [...connections, { cn: `dicom-${connections.length + 1}`, dicomHostname: '', dicomPort: 104 }],
            })}>
              + Соединение
            </Button>
          </div>

          {connections.map((connection, index) => {
            const tls = (connection.dicomTLSCipherSuite?.length ?? 0) > 0
            return (
              <div key={index} className="grid grid-cols-[110px_1fr_80px_auto_auto] items-end gap-2 rounded border border-line p-2">
                <Field label="Имя">
                  <TextInput
                    value={connection.cn ?? ''}
                    onChange={(event) => patchConnection(index, { cn: event.target.value })}
                  />
                </Field>
                <Field label="Хост">
                  <TextInput
                    value={connection.dicomHostname ?? ''}
                    onChange={(event) => patchConnection(index, { dicomHostname: event.target.value })}
                  />
                </Field>
                <Field label="Порт">
                  <TextInput
                    type="number"
                    value={connection.dicomPort ?? ''}
                    onChange={(event) => patchConnection(index, { dicomPort: Number(event.target.value) || undefined })}
                  />
                </Field>
                <div className="pb-1.5">
                  <Checkbox
                    label="TLS"
                    checked={tls}
                    onChange={(checked) => patchConnection(index, {
                      dicomTLSCipherSuite: checked ? TLS_CIPHERS : undefined,
                    })}
                  />
                </div>
                <Button
                  tone="danger"
                  className="mb-0.5"
                  onClick={() => patch({ dicomNetworkConnection: connections.filter((_, i) => i !== index) })}
                >
                  ✕
                </Button>
              </div>
            )
          })}
        </section>

        <section className="space-y-1.5">
          <p className="text-[11px] text-muted">AE устройства</p>
          <div className="flex flex-wrap gap-1.5">
            {(current.dicomNetworkAE ?? []).map((ae) => (
              <button
                key={ae.dicomAETitle}
                type="button"
                onClick={() => onOpenAe(ae.dicomAETitle)}
                className="rounded border border-line px-2 py-1 font-mono text-[11px] hover:border-accent hover:text-accent"
              >
                {ae.dicomAETitle}
              </button>
            ))}
            {(current.dicomNetworkAE?.length ?? 0) === 0 && (
              <span className="text-[11px] text-muted">нет ни одного AE</span>
            )}
          </div>
        </section>

        <section className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowJson((value) => !value)}
            className="text-[11px] text-accent hover:underline"
          >
            {showJson ? 'Скрыть' : 'Показать'} конфигурацию устройства целиком (JSON)
          </button>
          {showJson && (
            jsonTooBig ? (
              <p className="text-[11px] text-warn">
                Конфигурация этого устройства слишком велика для редактора
                ({Math.round(JSON.stringify(current).length / 1024)} КБ) — правьте её по разделам.
              </p>
            ) : (
              <JsonEditor label="JSON устройства" value={current} onChange={(next) => setDraft(next as Device)} rows={22} />
            )
          )}
        </section>

        <section className="space-y-1.5 border-t border-line pt-3">
          <p className="text-[11px] text-muted">Опасная зона</p>
          <Button
            tone="danger"
            disabled={remove.isPending}
            onClick={() => {
              if (!confirm(`Удалить устройство ${deviceName} со всеми его AE?`)) return
              remove.mutate(deviceName, { onSuccess: () => { onChanged(); onClose() } })
            }}
          >
            Удалить устройство
          </Button>
          {remove.error && <ErrorBox error={remove.error as Error} />}
        </section>
      </div>
    </div>
  )
}
