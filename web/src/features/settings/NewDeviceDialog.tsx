import { useState } from 'react'
import { useCreateDevice, useDevices, useUsedAeTitles } from '../../api/devices'
import type { Device } from '../../api/devices'
import { Button, Checkbox, Field, TextInput } from '../../components/form'
import { ErrorBox } from '../../components/ui'

/** Типовая задача: подключить внешний PACS или модальность — устройство, соединение и AE разом. */
export function NewDeviceDialog({
  onClose, onCreated,
}: {
  onClose(): void
  onCreated(deviceName: string, aeTitle: string): void
}) {
  const create = useCreateDevice()
  const devices = useDevices()
  const usedAets = useUsedAeTitles()

  const [name, setName] = useState('')
  const [aeTitle, setAeTitle] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(104)
  const [description, setDescription] = useState('')
  const [tls, setTls] = useState(false)
  const [initiator, setInitiator] = useState(true)
  const [acceptor, setAcceptor] = useState(true)

  const nameTaken = devices.data?.some((device) => device.dicomDeviceName === name) ?? false
  const aeTaken = usedAets.data?.includes(aeTitle) ?? false
  const aeBad = /\s/.test(aeTitle) || aeTitle.length > 16
  const valid = name && aeTitle && host && port > 0 && port < 65536 && !nameTaken && !aeTaken && !aeBad

  function submit() {
    const device: Device = {
      dicomDeviceName: name,
      dicomDescription: description || undefined,
      dicomInstalled: true,
      dicomNetworkConnection: [
        {
          cn: tls ? 'dicom-tls' : 'dicom',
          dicomHostname: host,
          dicomPort: port,
          ...(tls ? { dicomTLSCipherSuite: ['TLS_RSA_WITH_AES_128_CBC_SHA', 'SSL_RSA_WITH_3DES_EDE_CBC_SHA'] } : {}),
        },
      ],
      dicomNetworkAE: [
        {
          dicomAETitle: aeTitle,
          dicomDescription: description || undefined,
          dicomAssociationInitiator: initiator,
          dicomAssociationAcceptor: acceptor,
          dicomNetworkConnectionReference: ['/dicomNetworkConnection/0'],
          // Транспортные возможности не задаём: тогда архив предлагает узлу всё, что умеет сам.
          // Стоит перечислить хоть одну — и архив будет слать только перечисленное: узел
          // с одним Verification отвечает на C-ECHO, но снимков от архива не получит.
        },
      ],
    }
    create.mutate(device, { onSuccess: () => onCreated(name, aeTitle) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-[560px] rounded-lg border border-line bg-panel p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-[13px] font-medium">Новое подключение</h2>
        <p className="mt-0.5 text-[11px] text-muted">
          Создаст устройство с одним соединением и одним AE — этого достаточно, чтобы слать и принимать.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field
            label="Имя устройства"
            hint={nameTaken ? <span className="text-danger">такое устройство уже есть</span> : 'внутреннее имя в конфигурации'}
          >
            <TextInput value={name} placeholder="pacs-central" onChange={(event) => setName(event.target.value.trim())} />
          </Field>
          <Field
            label="AE Title"
            hint={
              aeTaken ? <span className="text-danger">титл уже занят</span>
                : aeBad ? <span className="text-danger">до 16 символов, без пробелов</span>
                : 'как узел представляется в сети'
            }
          >
            <TextInput value={aeTitle} placeholder="PACS_CENTRAL" maxLength={16}
              onChange={(event) => setAeTitle(event.target.value.trim().toUpperCase())} />
          </Field>
          <Field label="Хост или IP">
            <TextInput value={host} placeholder="10.0.0.20" onChange={(event) => setHost(event.target.value.trim())} />
          </Field>
          <Field label="Порт">
            <TextInput type="number" value={port} onChange={(event) => setPort(Number(event.target.value))} />
          </Field>
          <Field label="Описание" className="col-span-2">
            <TextInput value={description} placeholder="ЦАМИ, приёмный PACS"
              onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </div>

        <div className="mt-3 flex gap-4">
          <Checkbox label="Отправляет (инициатор)" checked={initiator} onChange={setInitiator} />
          <Checkbox label="Принимает (акцептор)" checked={acceptor} onChange={setAcceptor} />
          <Checkbox label="TLS" checked={tls} onChange={setTls} />
        </div>

        {create.error && <div className="mt-2"><ErrorBox error={create.error as Error} /></div>}

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>Отмена</Button>
          <Button tone="primary" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? 'Создаём…' : 'Создать'}
          </Button>
        </div>
      </div>
    </div>
  )
}
