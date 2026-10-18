import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { json } from '../../test/fakeArchive'
import { IVANOV_CHEST, standardArchive } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { countLabel } from '../../lib/plural'

const EXPORT = new RegExp(`^/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid.replace(/\./g, '\\.')}(/series/[^/]+)?/export/.+$`)

/** Архив с исследованиями, узлами (свои AE архива + внешние) и экспортёром. */
function sendArchive() {
  const archive = standardArchive()
  archive.on('GET', '/devices', [
    { dicomDeviceName: 'dcm4chee-arc', hasArcDevExt: true },
    { dicomDeviceName: 'storescp' },
    { dicomDeviceName: 'pacs2' },
  ])
  archive.on('GET', '/aes', [
    { dicomDeviceName: 'dcm4chee-arc', dicomAETitle: 'DCM4CHEE', dicomNetworkConnection: [{ dicomHostname: 'arc', dicomPort: 11112 }] },
    { dicomDeviceName: 'storescp', dicomAETitle: 'STORESCP', dicomDescription: 'Тестовый приёмник',
      dicomNetworkConnection: [{ dicomHostname: 'storescp', dicomPort: 11117 }] },
    { dicomDeviceName: 'pacs2', dicomAETitle: 'PACS2', dicomDescription: 'Областной PACS',
      dicomNetworkConnection: [{ dicomHostname: '10.0.0.5', dicomPort: 104 }] },
  ])
  archive.on('GET', '/devices/dcm4chee-arc', {
    dicomDeviceName: 'dcm4chee-arc',
    dcmDevice: { dcmArchiveDevice: { dcmExporter: [
      { dcmExporterID: 'TO_CLOUD', dcmURI: 'dicom:CLOUD', dicomDescription: 'Облачный архив', dcmQueueName: 'Export1' },
    ] } },
  })
  archive.on('POST', EXPORT, () => json({ completed: 49 }))
  return archive.install()
}

async function openSend(user: ReturnType<typeof renderApp>['user']) {
  const aside = await screen.findByRole('complementary', { name: 'Исследование' })
  await within(aside).findByRole('heading', { name: 'Иванов Иван Иванович' })
  await user.click(within(aside).getByRole('button', { name: 'Отправить' }))
  const dialog = await screen.findByRole('dialog', { name: /^Отправить: Иванов Иван Иванович/ })
  await within(dialog).findByRole('radio', { name: 'STORESCP' })
  return within(dialog)
}

const studyUrl = `/studies?study=${IVANOV_CHEST.uid}`

describe('отправка исследования', () => {
  it('в списке — только внешние узлы и экспортёры; отправка на AE — POST export/dicom:AE', async () => {
    const archive = sendArchive()
    const { user } = renderApp(studyUrl)
    const dialog = await openSend(user)

    expect(dialog.queryByRole('radio', { name: 'DCM4CHEE' })).toBeNull()
    expect(dialog.getByRole('radio', { name: 'PACS2' })).toBeInTheDocument()
    expect(await dialog.findByRole('radio', { name: 'TO_CLOUD' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Выберите, куда отправить' })).toBeDisabled()

    await user.click(dialog.getByRole('radio', { name: 'STORESCP' }))
    await user.click(dialog.getByRole('button', { name: 'Отправить 49 снимков → STORESCP' }))

    expect(await dialog.findByText('Отправлено: 49 снимков.')).toBeInTheDocument()
    expect(archive.calls('POST', EXPORT).map((request) => request.path))
      .toEqual([`/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid}/export/dicom:STORESCP`])
  })

  it('отправка одной серии', async () => {
    const archive = sendArchive()
    const { user } = renderApp(studyUrl)
    const dialog = await openSend(user)
    const series = IVANOV_CHEST.series![1]
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Что отправить' }), series.uid)
    await user.click(dialog.getByRole('radio', { name: 'PACS2' }))
    await user.click(dialog.getByRole('button', { name: `Отправить ${countLabel(series.instances.length, 'снимок', 'снимка', 'снимков')} → PACS2` }))
    await dialog.findByText(/Отправлено/)
    expect(archive.calls('POST', EXPORT)[0].path)
      .toBe(`/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid}/series/${series.uid}/export/dicom:PACS2`)
  })

  it('узел принял не всё — предупреждение и ссылка на его настройки', async () => {
    const archive = sendArchive()
    archive.on('POST', EXPORT, () => json({ completed: 40, failed: 9 }, { status: 502 }))
    const { user } = renderApp(studyUrl)
    const dialog = await openSend(user)
    await user.click(dialog.getByRole('radio', { name: 'STORESCP' }))
    await user.click(dialog.getByRole('button', { name: /^Отправить 49/ }))

    expect(await dialog.findByText(/Отправлено 40 из 49/)).toBeInTheDocument()
    expect(dialog.getByRole('link', { name: 'Открыть настройки STORESCP' }))
      .toHaveAttribute('href', '/settings?tab=ae&device=storescp&ae=STORESCP')
  })

  it('недоступный узел — понятная причина', async () => {
    const archive = sendArchive()
    archive.on('POST', EXPORT, () => json({ errorMessage: 'java.net.ConnectException: Connection refused' }, { status: 502 }))
    const { user } = renderApp(studyUrl)
    const dialog = await openSend(user)
    await user.click(dialog.getByRole('radio', { name: 'PACS2' }))
    await user.click(dialog.getByRole('button', { name: /^Отправить 49/ }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Узел не принимает подключение: порт закрыт или служба не запущена')
  })

  it('экспортёр — задача в очереди', async () => {
    const archive = sendArchive()
    archive.on('POST', EXPORT, () => json({ taskID: '7', queue: 'Export1', status: 'SCHEDULED' }, { status: 202 }))
    const { user } = renderApp(studyUrl)
    const dialog = await openSend(user)
    await user.click(await dialog.findByRole('radio', { name: 'TO_CLOUD' }))
    await user.click(dialog.getByRole('button', { name: 'Отправить 49 снимков → TO_CLOUD' }))
    expect(await dialog.findByText(/Поставлено в очередь «Export1», задача 7/)).toBeInTheDocument()
    expect(archive.calls('POST', EXPORT)[0].path).toBe(`/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid}/export/TO_CLOUD`)
  })

  it('«Проверить связь» — C-ECHO к выбранному узлу', async () => {
    const archive = sendArchive()
    archive.on('POST', '/aets/DCM4CHEE/dimse/STORESCP', { result: '0', connectionTime: '20', echoTime: '4' })
    const { user } = renderApp(studyUrl)
    const dialog = await openSend(user)
    await user.click(dialog.getByRole('radio', { name: 'STORESCP' }))
    await user.click(dialog.getByRole('button', { name: 'Проверить связь' }))
    expect(await dialog.findByText('Связь есть, 24 мс')).toBeInTheDocument()
    expect(archive.calls('POST', EXPORT)).toHaveLength(0)
  })

  it('поиск по узлам и запоминание последнего получателя', async () => {
    sendArchive()
    const { user } = renderApp(studyUrl)
    let dialog = await openSend(user)
    await user.type(dialog.getByRole('textbox', { name: 'Найти узел' }), 'областн')
    expect(dialog.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(['PACS2'])
    await user.click(dialog.getByRole('radio', { name: 'PACS2' }))
    await user.click(dialog.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openSend(user)
    expect(dialog.getByRole('radio', { name: 'PACS2' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Esc закрывает диалог, но не панель исследования', async () => {
    sendArchive()
    const { user, search } = renderApp(studyUrl)
    await openSend(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(search().study).toBe(IVANOV_CHEST.uid)
  })
})
