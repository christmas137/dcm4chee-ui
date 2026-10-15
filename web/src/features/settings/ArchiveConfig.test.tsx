import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { archiveDevice, clone, configArchive, storescpDevice } from '../../test/configFixtures'
import type { Device } from '../../api/devices'
import { renderApp } from '../../test/renderApp'

const ARC = (device: Device) => (device.dcmDevice as { dcmArchiveDevice: Record<string, unknown> }).dcmArchiveDevice

function lastPut(archive: ReturnType<typeof configArchive>): Device {
  const puts = archive.calls('PUT', '/devices/dcm4chee-arc')
  return puts[puts.length - 1].body as Device
}

const nav = () => screen.getByRole('navigation', { name: 'Разделы конфигурации' })

describe('навигатор настроек архива', () => {
  it('группы и разделы со счётчиками записей', async () => {
    configArchive().install()
    renderApp('/settings?tab=archive')
    await screen.findByText('Хранение')
    const menu = within(nav())
    expect(menu.getByRole('button', { name: 'Хранилища 1' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Очереди 2' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Экспортёры 0' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Веб-приложения 1' })).toBeInTheDocument()
  })

  it('раздел, которого нет в реестре, всё равно доступен — в «Прочем»', async () => {
    const device = archiveDevice()
    ARC(device).dcmFutureRule = [{ cn: 'из новой версии' }]
    configArchive([device]).install()
    renderApp('/settings?tab=archive')
    await screen.findByText('Прочее')
    expect(within(nav()).getByRole('button', { name: 'dcmFutureRule 1' })).toBeInTheDocument()
  })

  it('фильтр разделов', async () => {
    configArchive().install()
    const { user } = renderApp('/settings?tab=archive')
    await screen.findByText('Хранение')
    await user.type(screen.getByPlaceholderText('Раздел…'), 'очер')
    expect(within(nav()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Параметры архива', 'Очереди 2'])
  })
})

describe('параметры архива', () => {
  it('правка строкового параметра → PUT, где изменён ровно он', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=scalars')
    const input = await screen.findByDisplayValue('org.dcm4che3.soundex.ESoundex')
    await user.clear(input)
    await user.type(input, 'org.dcm4che3.soundex.Metaphone')
    expect(screen.getByText('есть несохранённые правки')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    const expected = archiveDevice()
    ARC(expected).dcmFuzzyAlgorithmClass = 'org.dcm4che3.soundex.Metaphone'
    expect(lastPut(archive)).toEqual(expected)
  })

  it('число остаётся числом, флаг — флагом', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=scalars')
    const limit = await screen.findByDisplayValue('1000')
    await user.clear(limit)
    await user.type(limit, '500')
    await user.click(screen.getByRole('checkbox', { name: 'выключено' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive))).toMatchObject({ dcmQueryMaxNumberOfResults: 500, dcmValidateCallingAEHostname: true })
  })

  it('поиск по параметрам', async () => {
    configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=scalars')
    await screen.findByDisplayValue('PT1H')
    expect(screen.getByText('4 из 4')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/^Поиск по имени/), 'fuzzy')
    expect(screen.getByText('1 из 4')).toBeInTheDocument()
    expect(screen.getByText('dcmFuzzyAlgorithmClass')).toBeInTheDocument()
  })

  it('«Отменить» сбрасывает правки без записи', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=scalars')
    const input = await screen.findByDisplayValue('PT1H')
    await user.clear(input)
    await user.type(input, 'PT5M')
    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(screen.getByDisplayValue('PT1H')).toBeInTheDocument()
    expect(archive.calls('PUT', /\/devices\//)).toHaveLength(0)
  })
})

describe('разделы-списки', () => {
  const queues = 'dcmDevice/dcmArchiveDevice/dcmQueue'

  it('таблица с колонками из реестра', async () => {
    configArchive().install()
    renderApp(`/settings?tab=archive&section=${queues}`)
    const row = (await screen.findByRole('cell', { name: 'Export1' })).closest('tr')!
    expect(within(row).getByText('Export Tasks 1')).toBeInTheDocument()
    expect(within(row).getByText('10')).toBeInTheDocument()
  })

  it('правка записи через JSON → PUT с изменённой записью', async () => {
    const archive = configArchive().install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('cell', { name: 'Export1' }))
    const textarea = screen.getByRole('textbox', { name: 'JSON записи' })
    fireEvent.change(textarea, { target: { value: JSON.stringify({ dcmQueueName: 'Export1', dcmMaxRetries: 3 }) } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive)).dcmQueue).toEqual([
      { dcmQueueName: 'Export1', dcmMaxRetries: 3 },
      { dcmQueueName: 'StgCmtSCU', dicomDescription: 'Storage Commitment', dcmMaxRetries: 10 },
    ])
  })

  it('удаление записи', async () => {
    const archive = configArchive().install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('cell', { name: 'StgCmtSCU' }))
    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(ARC(lastPut(archive)).dcmQueue).toEqual([
      { dcmQueueName: 'Export1', dicomDescription: 'Export Tasks 1', dcmMaxRetries: 10 },
    ]))
  })

  it('добавление первой записи в пустой раздел (экспортёр)', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=dcmDevice/dcmArchiveDevice/dcmExporter')
    expect(await screen.findByText('Раздел пуст')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Добавить' }))
    const exporter = { dcmExporterID: 'STORESCP', dcmURI: 'dicom:STORESCP', dicomAETitle: 'DCM4CHEE', dcmQueueName: 'Export1' }
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON записи' }), { target: { value: JSON.stringify(exporter) } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(ARC(lastPut(archive)).dcmExporter).toEqual([exporter]))
    // Остальная конфигурация архива не изменилась.
    const rest = clone(lastPut(archive))
    ARC(rest).dcmExporter = []
    expect(rest).toEqual(archiveDevice())
  })

  it('правит именно устройство-архив, даже если оно не первое в списке', async () => {
    const archive = configArchive([storescpDevice(), archiveDevice()]).install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('cell', { name: 'StgCmtSCU' }))
    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(archive.calls('PUT', '/devices/storescp')).toHaveLength(0)
  })
})
