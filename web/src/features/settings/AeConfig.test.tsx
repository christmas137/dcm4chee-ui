import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { archiveDevice, clone, configArchive } from '../../test/configFixtures'
import type { Device } from '../../api/devices'
import { renderApp } from '../../test/renderApp'

async function openAe(user: ReturnType<typeof renderApp>['user'], title: string) {
  await user.click(await screen.findByRole('cell', { name: title }))
  await screen.findByText(`устройство ${title === 'STORESCP' ? 'storescp' : 'dcm4chee-arc'}`)
}

function lastPut(archive: ReturnType<typeof configArchive>, device = 'dcm4chee-arc'): Device {
  const puts = archive.calls('PUT', `/devices/${device}`)
  expect(puts.length).toBeGreaterThan(0)
  return puts[puts.length - 1].body as Device
}

describe('список AE', () => {
  it('все AE со всех устройств одной таблицей, с адресами и ролями', async () => {
    configArchive().install()
    renderApp('/settings')
    const row = (await screen.findByRole('cell', { name: 'DCM4CHEE' })).closest('tr')!
    expect(within(row).getByText('dcm4chee-arc')).toBeInTheDocument()
    expect(within(row).getByText('arc:11112, arc:2762 TLS')).toBeInTheDocument()
    expect(within(row).getByText('принимает, отправляет')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'STORESCP' })).toBeInTheDocument()
    expect(screen.getByText('3 из 3')).toBeInTheDocument()
  })

  it('фильтр ищет по титлу, устройству и адресу; слова — через И', async () => {
    configArchive().install()
    const { user } = renderApp('/settings')
    const filter = await screen.findByPlaceholderText(/^Фильтр: титл/)

    await user.type(filter, 'storescp')
    expect(screen.getAllByRole('row')).toHaveLength(2) // заголовок + строка
    await user.clear(filter)
    await user.type(filter, 'arc:')
    expect(screen.getByText('2 из 3')).toBeInTheDocument()
    // Порт TLS-соединения есть только у AE архива DCM4CHEE.
    await user.clear(filter)
    await user.type(filter, '2762')
    expect(screen.getByText('1 из 3')).toBeInTheDocument()
    await user.type(filter, ' worklist')
    expect(screen.getByText('0 из 3')).toBeInTheDocument()
  })
})

describe('редактор AE', () => {
  it('правка роли и описания уходит PUT-ом целого устройства; остальное не тронуто', async () => {
    const archive = configArchive().install()
    const original = archiveDevice()
    const { user } = renderApp('/settings')
    await openAe(user, 'DCM4CHEE')

    await user.click(screen.getByRole('checkbox', { name: /Акцептор/ }))
    const description = screen.getByDisplayValue('Hide instances rejected for Quality Reasons')
    await user.clear(description)
    await user.type(description, 'Основной AE')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    const sent = lastPut(archive)
    const expected = clone(original)
    expected.dicomNetworkAE![0].dicomAssociationAcceptor = false
    expected.dicomNetworkAE![0].dicomDescription = 'Основной AE'
    expect(sent).toEqual(expected)
  })

  it('отвязка соединения меняет только ссылки этого AE', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await openAe(user, 'DCM4CHEE')

    await user.click(screen.getByRole('checkbox', { name: /arc:2762 TLS/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    const sent = lastPut(archive)
    expect(sent.dicomNetworkAE![0].dicomNetworkConnectionReference).toEqual(['/dicomNetworkConnection/0'])
    expect(sent.dicomNetworkConnection).toEqual(archiveDevice().dicomNetworkConnection)
  })

  it('без соединений — предупреждение: такой AE работать не будет', async () => {
    configArchive().install()
    const { user } = renderApp('/settings')
    await openAe(user, 'WORKLIST')
    await user.click(screen.getByRole('checkbox', { name: /arc:11112/ }))
    expect(screen.getByText('AE без соединения работать не будет.')).toBeInTheDocument()
  })

  it('переименование AE сохраняется и видно в списке', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await openAe(user, 'WORKLIST')

    const title = screen.getByDisplayValue('WORKLIST')
    await user.clear(title)
    await user.type(title, 'MWL')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(lastPut(archive).dicomNetworkAE!.map((ae) => ae.dicomAETitle)).toEqual(['DCM4CHEE', 'MWL']))
    expect(await screen.findByRole('cell', { name: 'MWL' })).toBeInTheDocument()
  })

  it('«Отменить» возвращает как было и ничего не отправляет', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await openAe(user, 'DCM4CHEE')

    await user.click(screen.getByRole('checkbox', { name: /Инициатор/ }))
    expect(screen.getByRole('checkbox', { name: /Инициатор/ })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Отменить' }))

    expect(screen.getByRole('checkbox', { name: /Инициатор/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
    expect(archive.calls('PUT', /\/devices\//)).toHaveLength(0)
  })

  it('транспортные возможности: удаление и добавление', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await openAe(user, 'DCM4CHEE')

    await user.click(screen.getByRole('button', { name: /Показать транспортные возможности \(1: SCP 1, SCU 0\)/ }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(screen.getByText(/Ничего не задано/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Добавить возможность' }))
    await user.type(screen.getByPlaceholderText(/^Название/), 'MR Image Storage SCP')
    const sop = screen.getByPlaceholderText('SOP Class UID')
    await user.clear(sop)
    await user.type(sop, '1.2.840.10008.5.1.4.1.1.4')
    await user.click(screen.getByRole('button', { name: 'Добавить' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(lastPut(archive).dicomNetworkAE![0].dicomTransferCapability).toEqual([{
      cn: 'MR Image Storage SCP',
      dicomSOPClass: '1.2.840.10008.5.1.4.1.1.4',
      dicomTransferRole: 'SCP',
      dicomTransferSyntax: ['1.2.840.10008.1.2', '1.2.840.10008.1.2.1'],
    }])
  })

  it('JSON-редактор даёт доступ к полям без формы (dcmNetworkAE)', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await openAe(user, 'DCM4CHEE')

    await user.click(screen.getByRole('button', { name: /все поля AE \(JSON\)/ }))
    const textarea = screen.getByRole('textbox', { name: 'JSON AE' }) as HTMLTextAreaElement
    const value = JSON.parse(textarea.value)
    value.dcmNetworkAE.dcmQueryRetrieveViewID = 'regularUse'
    await user.clear(textarea)
    await user.click(textarea)
    await user.paste(JSON.stringify(value))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    expect(lastPut(archive).dicomNetworkAE![0].dcmNetworkAE).toEqual({ dcmQueryRetrieveViewID: 'regularUse' })
  })

  it('удаление AE — после подтверждения, PUT устройства без этого AE', async () => {
    const archive = configArchive().install()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp('/settings')
    await openAe(user, 'WORKLIST')

    await user.click(screen.getByRole('button', { name: 'Удалить AE' }))
    await waitFor(() => expect(lastPut(archive).dicomNetworkAE!.map((ae) => ae.dicomAETitle)).toEqual(['DCM4CHEE']))
    expect(window.confirm).toHaveBeenCalledWith('Удалить AE WORKLIST из устройства dcm4chee-arc?')
  })

  it('отказ в подтверждении — ничего не удаляется', async () => {
    const archive = configArchive().install()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = renderApp('/settings')
    await openAe(user, 'WORKLIST')
    await user.click(screen.getByRole('button', { name: 'Удалить AE' }))
    expect(archive.calls('PUT', /\/devices\//)).toHaveLength(0)
  })

  it('у последнего AE устройства можно удалить устройство целиком', async () => {
    const archive = configArchive().install()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp('/settings')
    await openAe(user, 'STORESCP')

    await user.click(screen.getByRole('button', { name: 'Удалить устройство целиком' }))
    await waitFor(() => expect(archive.calls('DELETE', '/devices/storescp')).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'STORESCP' })).not.toBeInTheDocument())
    // У AE архива такой кнопки нет — там AE не последний.
    expect(archive.store.has('dcm4chee-arc')).toBe(true)
  })
})

describe('применение конфигурации', () => {
  it('после записи — плашка; «Применить» шлёт /ctrl/reload и убирает её', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await openAe(user, 'DCM4CHEE')
    expect(screen.queryByText(/Конфигурация изменена/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Инициатор/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText(/Конфигурация изменена/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Применить' }))
    await waitFor(() => expect(archive.calls('POST', '/ctrl/reload')).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText(/Конфигурация изменена/)).not.toBeInTheDocument())
  })
})

describe('новое подключение', () => {
  async function fill(user: ReturnType<typeof renderApp>['user'], values: Partial<Record<'name' | 'ae' | 'host' | 'port' | 'desc', string>>) {
    await user.click(await screen.findByRole('button', { name: '+ Новое подключение' }))
    if (values.name) await user.type(screen.getByPlaceholderText('pacs-central'), values.name)
    if (values.ae) await user.type(screen.getByPlaceholderText('PACS_CENTRAL'), values.ae)
    if (values.host) await user.type(screen.getByPlaceholderText('10.0.0.20'), values.host)
    if (values.port) {
      const port = screen.getByDisplayValue('104')
      await user.clear(port)
      await user.type(port, values.port)
    }
    if (values.desc) await user.type(screen.getByPlaceholderText('ЦАМИ, приёмный PACS'), values.desc)
  }

  it('создаёт устройство с соединением, AE и Verification — ровно такой POST', async () => {
    const archive = configArchive().install()
    const { user, search } = renderApp('/settings')
    await fill(user, { name: 'ct-214', ae: 'ct_scanner_1', host: '10.0.0.77', port: '11112', desc: 'КТ, кабинет 214' })
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    await waitFor(() => expect(archive.calls('POST', '/devices/ct-214')).toHaveLength(1))
    const verification = (role: string) => ({
      cn: `Verification ${role}`, dicomSOPClass: '1.2.840.10008.1.1', dicomTransferRole: role,
      dicomTransferSyntax: ['1.2.840.10008.1.2', '1.2.840.10008.1.2.1'],
    })
    expect(archive.calls('POST', '/devices/ct-214')[0].body).toEqual({
      dicomDeviceName: 'ct-214',
      dicomDescription: 'КТ, кабинет 214',
      dicomInstalled: true,
      dicomNetworkConnection: [{ cn: 'dicom', dicomHostname: '10.0.0.77', dicomPort: 11112 }],
      dicomNetworkAE: [{
        dicomAETitle: 'CT_SCANNER_1', // в верхнем регистре
        dicomDescription: 'КТ, кабинет 214',
        dicomAssociationInitiator: true,
        dicomAssociationAcceptor: true,
        dicomNetworkConnectionReference: ['/dicomNetworkConnection/0'],
        dicomTransferCapability: [verification('SCP'), verification('SCU')],
      }],
    })
    // Сразу открылся редактор нового AE, и предложено применить конфигурацию.
    await waitFor(() => expect(search()).toMatchObject({ tab: 'ae', device: 'ct-214', ae: 'CT_SCANNER_1' }))
    expect(screen.getByText(/Конфигурация изменена/)).toBeInTheDocument()
  })

  it('TLS: соединение dicom-tls с набором шифров', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await fill(user, { name: 'pacs-tls', ae: 'PACS_TLS', host: 'pacs.local' })
    await user.click(screen.getByRole('checkbox', { name: 'TLS' }))
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    await waitFor(() => expect(archive.calls('POST', '/devices/pacs-tls')).toHaveLength(1))
    const body = archive.calls('POST', '/devices/pacs-tls')[0].body as Device
    expect(body.dicomNetworkConnection).toEqual([{
      cn: 'dicom-tls', dicomHostname: 'pacs.local', dicomPort: 104,
      dicomTLSCipherSuite: ['TLS_RSA_WITH_AES_128_CBC_SHA', 'SSL_RSA_WITH_3DES_EDE_CBC_SHA'],
    }])
  })

  it('занятый AE-титл не даёт создать', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings')
    await fill(user, { name: 'dup', ae: 'STORESCP', host: 'h' })
    expect(await screen.findByText('титл уже занят')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать' })).toBeDisabled()
    expect(archive.calls('POST', /\/devices\//)).toHaveLength(0)
  })

  it('занятое имя устройства не даёт создать', async () => {
    configArchive().install()
    const { user } = renderApp('/settings')
    await fill(user, { name: 'storescp', ae: 'NEW_AE', host: 'h' })
    expect(await screen.findByText('такое устройство уже есть')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать' })).toBeDisabled()
  })

  it('AE-титл длиннее 16 символов обрезается полем', async () => {
    configArchive().install()
    const { user } = renderApp('/settings')
    await fill(user, { ae: 'ABCDEFGHIJKLMNOPQRS' })
    expect(screen.getByPlaceholderText('PACS_CENTRAL')).toHaveValue('ABCDEFGHIJKLMNOP')
  })

  it('без хоста создать нельзя', async () => {
    configArchive().install()
    const { user } = renderApp('/settings')
    await fill(user, { name: 'x', ae: 'X' })
    expect(screen.getByRole('button', { name: 'Создать' })).toBeDisabled()
  })
})
