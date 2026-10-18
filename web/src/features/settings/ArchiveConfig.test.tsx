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
const save = () => screen.getByRole('button', { name: 'Сохранить' })
/** Строки полей формы — по ключам атрибутов, в порядке показа. */
const shownFields = () => [...document.querySelectorAll('[data-field]')].map((row) => row.getAttribute('data-field'))

describe('навигатор настроек архива', () => {
  it('темы параметров с числом заданных, разделы — с числом записей', async () => {
    configArchive().install()
    renderApp('/settings?tab=archive')
    await screen.findByText('Хранение')
    const menu = within(nav())
    // В фикстуре заданы 5 параметров архива: по одному в пяти темах.
    expect(menu.getByRole('button', { name: /^Все параметры 5\/\d{3}$/ })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Пациенты 1' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Поиск 1' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Приём объектов 0' })).toBeInTheDocument()
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
    await user.type(screen.getByPlaceholderText('Раздел или параметр…'), 'очер')
    expect(within(nav()).getByRole('button', { name: 'Очереди 2' })).toBeInTheDocument()
    expect(within(nav()).queryByRole('button', { name: /^Хранилища/ })).not.toBeInTheDocument()
  })

  it('поиск находит параметр, клик открывает его тему с одним этим полем', async () => {
    configArchive().install()
    const { user, search } = renderApp('/settings?tab=archive')
    await screen.findByText('Хранение')
    await user.type(screen.getByPlaceholderText('Раздел или параметр…'), 'перезапис')
    await user.click(within(nav()).getByRole('button', { name: 'Политика перезаписи' }))
    await waitFor(() => expect(search()).toMatchObject({ section: 'params:store' }))
    expect(await screen.findByRole('combobox', { name: 'Политика перезаписи' })).toBeInTheDocument()
    expect(shownFields()).toEqual(['dcmOverwritePolicy'])
  })
})

describe('параметры архива', () => {
  it('выбор варианта → PUT, где изменён ровно этот параметр', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params:patient')
    const fuzzy = await screen.findByRole('combobox', { name: 'Алгоритм нечёткого поиска' })
    expect(fuzzy).toHaveValue('org.dcm4che3.soundex.ESoundex')
    await user.selectOptions(fuzzy, 'org.dcm4che3.soundex.Metaphone')
    // Пояснение к выбранному варианту — по-русски.
    expect(screen.getByText(/Metaphone: кодирует по правилам английского/)).toBeInTheDocument()
    expect(screen.getByText('есть несохранённые правки')).toBeInTheDocument()
    await user.click(save())

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    const expected = archiveDevice()
    ARC(expected).dcmFuzzyAlgorithmClass = 'org.dcm4che3.soundex.Metaphone'
    expect(lastPut(archive)).toEqual(expected)
  })

  it('число остаётся числом, флаг — флагом', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params')
    const limit = await screen.findByRole('textbox', { name: 'Макс. результатов поиска (C-FIND)' })
    await user.clear(limit)
    await user.type(limit, '500')
    const hostCheck = screen.getByRole('radiogroup', { name: 'Проверять хост вызывающего AE' })
    expect(within(hostCheck).getByRole('radio', { name: 'нет' })).toBeChecked()
    await user.click(within(hostCheck).getByRole('radio', { name: 'да' }))
    await user.click(save())

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive))).toMatchObject({ dcmQueryMaxNumberOfResults: 500, dcmValidateCallingAEHostname: true })
  })

  it('сброс к умолчанию убирает ключ из конфигурации', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params:patient')
    await user.click(await screen.findByRole('button', { name: 'Сбросить: Алгоритм нечёткого поиска' }))
    expect(screen.getByRole('combobox', { name: 'Алгоритм нечёткого поиска' })).toHaveValue('')
    await user.click(save())

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive))).not.toHaveProperty('dcmFuzzyAlgorithmClass')
    expect(ARC(lastPut(archive))).toMatchObject({ dcmQueryMaxNumberOfResults: 1000 })
  })

  it('флаг можно вернуть в «не задано» — ключ уходит из конфигурации', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params:security')
    const hostCheck = await screen.findByRole('radiogroup', { name: 'Проверять хост вызывающего AE' })
    await user.click(within(hostCheck).getByRole('radio', { name: 'по умолчанию: нет' }))
    await user.click(save())
    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive))).not.toHaveProperty('dcmValidateCallingAEHostname')
  })

  it('незаданный параметр показывает умолчание и не попадает в конфигурацию', async () => {
    configArchive().install()
    renderApp('/settings?tab=archive&section=params:store')
    const overwrite = await screen.findByRole('combobox', { name: 'Политика перезаписи' })
    expect(overwrite).toHaveValue('')
    expect(within(overwrite).getByRole('option', { name: 'по умолчанию (NEVER)' })).toBeInTheDocument()
    expect(screen.getByText(/Никогда не перезаписывать ранее полученный объект/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Каталог буферизации STOW-RS' }))
      .toHaveAttribute('placeholder', 'по умолчанию: ${jboss.server.temp.dir}')
  })

  it('фильтры «Заданные» и «Изменённые», поиск по параметрам', async () => {
    configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params')
    await screen.findByRole('textbox', { name: 'Макс. результатов поиска (C-FIND)' })
    expect(shownFields().length).toBeGreaterThan(250)

    await user.click(screen.getByRole('button', { name: 'Заданные' }))
    expect(shownFields().sort()).toEqual([
      'dcmFuzzyAlgorithmClass', 'dcmHideSPSWithStatusFromMWL', 'dcmPurgeQueueMessagePollingInterval',
      'dcmQueryMaxNumberOfResults', 'dcmValidateCallingAEHostname',
    ])

    await user.click(screen.getByRole('button', { name: 'Изменённые' }))
    expect(screen.getByText('Несохранённых правок нет')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Все' }))
    const limit = screen.getByRole('textbox', { name: 'Макс. результатов поиска (C-FIND)' })
    await user.clear(limit)
    await user.type(limit, '20')
    await user.click(screen.getByRole('button', { name: 'Изменённые' }))
    expect(shownFields()).toEqual(['dcmQueryMaxNumberOfResults'])
    expect(screen.getByText('изменено')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Все' }))
    await user.type(screen.getByRole('textbox', { name: 'Найти параметр' }), 'нечётк')
    expect(shownFields()).toEqual(['dcmFuzzyAlgorithmClass', 'dcmPersonNameComponentOrderInsensitiveMatching'])
  })

  it('длительность расшифровывается, ошибка формата видна сразу', async () => {
    configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params:tasks')
    const interval = await screen.findByRole('textbox', { name: 'Интервал опроса очистки задач' })
    expect(screen.getByText('1 ч')).toBeInTheDocument()
    await user.clear(interval)
    await user.type(interval, 'PT90M')
    expect(screen.getByText('90 мин')).toBeInTheDocument()
    await user.clear(interval)
    await user.type(interval, 'час')
    expect(screen.getByText(/не похоже на длительность/)).toBeInTheDocument()
  })

  it('стёртое текстовое значение убирает ключ, а не пишет пустую строку', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params:tasks')
    await user.clear(await screen.findByRole('textbox', { name: 'Интервал опроса очистки задач' }))
    await user.click(save())
    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive))).not.toHaveProperty('dcmPurgeQueueMessagePollingInterval')
  })

  it('несколько значений из набора — переключателями', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params:worklist')
    const statuses = await screen.findByRole('group', { name: 'Скрывать в MWL SCP SPS со статусом' })
    expect(within(statuses).getByRole('button', { name: 'COMPLETED' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(statuses).getByRole('button', { name: 'CANCELED' }))
    await user.click(save())
    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive)).dcmHideSPSWithStatusFromMWL).toEqual(['COMPLETED', 'CANCELED'])
  })

  it('«Отменить» сбрасывает правки без записи', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=params:tasks')
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

  it('запись правится формой → PUT с изменённой записью', async () => {
    const archive = configArchive().install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('button', { name: 'Export1' }))
    expect(within(screen.getByRole('navigation', { name: 'Путь' })).getByText('Export1')).toBeInTheDocument()
    const retries = screen.getByRole('textbox', { name: 'Макс. число повторов' })
    await user.clear(retries)
    await user.type(retries, '3')
    await user.click(save())

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive)).dcmQueue).toEqual([
      { dcmQueueName: 'Export1', dicomDescription: 'Export Tasks 1', dcmMaxRetries: 3 },
      { dcmQueueName: 'StgCmtSCU', dicomDescription: 'Storage Commitment', dcmMaxRetries: 10 },
    ])
  })

  it('«хлебные крошки» возвращают к списку', async () => {
    configArchive().install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('button', { name: 'Export1' }))
    await user.click(within(screen.getByRole('navigation', { name: 'Путь' })).getByRole('button', { name: 'Очереди' }))
    expect(screen.getByRole('cell', { name: 'StgCmtSCU' })).toBeInTheDocument()
  })

  it('удаление записи — из формы и из таблицы', async () => {
    const archive = configArchive().install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('button', { name: 'StgCmtSCU' }))
    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    expect(screen.queryByRole('cell', { name: 'StgCmtSCU' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Удалить Export1' }))
    expect(screen.getByText('Пока пусто')).toBeInTheDocument()
    await user.click(save())
    // Пустой список не пишется пустым массивом — ключ уходит целиком.
    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive))).not.toHaveProperty('dcmQueue')
  })

  it('копия записи получает свой идентификатор и встаёт следом', async () => {
    const archive = configArchive().install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('button', { name: 'Копировать Export1' }))
    expect(screen.getByRole('textbox', { name: 'Очередь' })).toHaveValue('Export1-копия')
    await user.click(save())
    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect((ARC(lastPut(archive)).dcmQueue as { dcmQueueName: string }[]).map((queue) => queue.dcmQueueName))
      .toEqual(['Export1', 'Export1-копия', 'StgCmtSCU'])
  })

  it('новый экспортёр заводится формой; очереди подсказываются из конфигурации', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=archive&section=dcmDevice/dcmArchiveDevice/dcmExporter')
    expect(await screen.findByText('Пока пусто')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Добавить' }))
    // Обязательные поля без умолчаний помечены.
    expect(screen.getAllByText('обязательное поле').length).toBeGreaterThanOrEqual(4)

    await user.type(screen.getByRole('textbox', { name: 'ID экспортёра' }), 'STORESCP')
    await user.type(screen.getByRole('textbox', { name: 'URI назначения' }), 'dicom:STORESCP')
    // Поля-ссылки с подсказками — это combobox: можно выбрать из списка или ввести своё.
    await user.type(screen.getByRole('combobox', { name: 'AE-титл архива' }), 'DCM4CHEE')
    const queue = screen.getByRole('combobox', { name: 'Очередь' })
    const options = [...document.getElementById(queue.getAttribute('list')!)!.querySelectorAll('option')]
    expect(options.map((option) => option.value)).toEqual(['Export1', 'StgCmtSCU'])
    await user.type(queue, 'Export1')
    expect(screen.getByText('Export Tasks 1')).toBeInTheDocument()
    await user.click(save())

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(ARC(lastPut(archive)).dcmExporter).toEqual([
      { dcmExporterID: 'STORESCP', dcmURI: 'dicom:STORESCP', dicomAETitle: 'DCM4CHEE', dcmQueueName: 'Export1' },
    ])
    // Остальная конфигурация архива не изменилась.
    const rest = clone(lastPut(archive))
    ARC(rest).dcmExporter = []
    expect(rest).toEqual(archiveDevice())
  })

  it('раздел без схемы (из новой версии архива) правится JSON-ом', async () => {
    const device = archiveDevice()
    ARC(device).dcmFutureRule = [{ cn: 'из новой версии' }]
    const archive = configArchive([device]).install()
    const { user } = renderApp('/settings?tab=archive&section=dcmDevice/dcmArchiveDevice/dcmFutureRule')
    await user.click(await screen.findByRole('cell', { name: 'из новой версии' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON записи' }), { target: { value: '{"cn":"правка"}' } })
    await user.click(save())
    await waitFor(() => expect(ARC(lastPut(archive)).dcmFutureRule).toEqual([{ cn: 'правка' }]))
  })

  it('правит именно устройство-архив, даже если оно не первое в списке', async () => {
    const archive = configArchive([storescpDevice(), archiveDevice()]).install()
    const { user } = renderApp(`/settings?tab=archive&section=${queues}`)
    await user.click(await screen.findByRole('button', { name: 'StgCmtSCU' }))
    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    await user.click(save())
    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(archive.calls('PUT', '/devices/storescp')).toHaveLength(0)
  })
})
