import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { archiveDevice, clone, configArchive, storescpDevice } from '../../test/configFixtures'
import type { Device } from '../../api/devices'
import { renderApp } from '../../test/renderApp'

function lastPut(archive: ReturnType<typeof configArchive>, device: string): Device {
  const puts = archive.calls('PUT', `/devices/${device}`)
  return puts[puts.length - 1].body as Device
}

async function openDevice(user: ReturnType<typeof renderApp>['user'], name: string) {
  await user.click(await screen.findByRole('cell', { name: new RegExp(`^${name}`) }))
  await screen.findByRole('button', { name: '+ Соединение' })
}

describe('список устройств', () => {
  it('показывает устройства, архив помечен', async () => {
    configArchive().install()
    renderApp('/settings?tab=devices')
    const archiveCell = await screen.findByRole('cell', { name: /^dcm4chee-arc/ })
    expect(archiveCell).toHaveTextContent('архив')
    expect(screen.getByRole('cell', { name: 'storescp' })).toBeInTheDocument()
  })
})

describe('редактор устройства', () => {
  it('правка хоста и порта соединения → PUT с изменённым соединением', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'storescp')

    const host = screen.getByLabelText('Хост')
    await user.clear(host)
    await user.type(host, '10.0.0.5')
    const port = screen.getByLabelText('Порт')
    await user.clear(port)
    await user.type(port, '104')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/storescp')).toHaveLength(1))
    const expected = storescpDevice()
    expected.dicomNetworkConnection![0] = { ...expected.dicomNetworkConnection![0], dicomHostname: '10.0.0.5', dicomPort: 104 }
    expect(lastPut(archive, 'storescp')).toEqual(expected)
  })

  it('TLS включается набором шифров и выключается их удалением', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'dcm4chee-arc')

    const tlsBoxes = screen.getAllByRole('checkbox', { name: 'TLS' })
    expect(tlsBoxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, true])
    await user.click(tlsBoxes[0])
    await user.click(tlsBoxes[1])
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/dcm4chee-arc')).toHaveLength(1))
    const [plain, tls] = lastPut(archive, 'dcm4chee-arc').dicomNetworkConnection!
    expect(plain.dicomTLSCipherSuite).toEqual(['TLS_RSA_WITH_AES_128_CBC_SHA', 'SSL_RSA_WITH_3DES_EDE_CBC_SHA'])
    expect(tls).not.toHaveProperty('dicomTLSCipherSuite')
  })

  it('добавление и удаление соединения', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'storescp')

    await user.click(screen.getByRole('button', { name: '+ Соединение' }))
    await user.type(screen.getAllByLabelText('Хост')[1], 'backup.local')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(lastPut(archive, 'storescp').dicomNetworkConnection).toHaveLength(2))
    expect(lastPut(archive, 'storescp').dicomNetworkConnection![1]).toEqual({ cn: 'dicom-2', dicomHostname: 'backup.local', dicomPort: 104 })

    // Удаляем добавленное (кнопка ✕ рядом со вторым соединением).
    const removeButtons = screen.getAllByRole('button', { name: '✕' }).filter((b) => b.className.includes('danger'))
    await user.click(removeButtons[1])
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(lastPut(archive, 'storescp').dicomNetworkConnection).toHaveLength(1))
  })

  it('описание и флаг «установлено»', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'storescp')
    await user.type(screen.getByLabelText('Описание'), 'Тестовый приёмник')
    await user.click(screen.getByRole('checkbox', { name: 'Установлено' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(lastPut(archive, 'storescp')).toMatchObject({
      dicomDescription: 'Тестовый приёмник', dicomInstalled: false,
    }))
  })

  it('JSON устройства целиком: правка уходит как есть, невалидный JSON не применяется', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'storescp')
    await user.click(screen.getByRole('tab', { name: 'JSON' }))
    const textarea = screen.getByRole('textbox', { name: 'JSON устройства' })

    fireEvent.change(textarea, { target: { value: '{ сломано' } })
    expect(screen.getByText(/JSON не разбирается/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()

    const edited = { ...storescpDevice(), dicomManufacturer: 'dcm4che.org' }
    fireEvent.change(textarea, { target: { value: JSON.stringify(edited) } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(lastPut(archive, 'storescp')).toEqual(edited))
  })

  it('«Все параметры»: поля устройства и расширенные параметры соединения', async () => {
    const archive = configArchive().install()
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'storescp')
    await user.click(screen.getByRole('tab', { name: 'Все параметры' }))

    await user.type(screen.getByRole('textbox', { name: 'Производитель' }), 'dcm4che.org')
    await user.click(screen.getByRole('button', { name: 'Сетевые соединения: 1 запись' }))
    await user.click(screen.getByRole('button', { name: 'storescp:11117 dicom' }))
    await user.type(screen.getByRole('textbox', { name: 'Таймаут TCP-подключения' }), '5000')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(archive.calls('PUT', '/devices/storescp')).toHaveLength(1))
    const expected = { ...storescpDevice(), dicomManufacturer: 'dcm4che.org' }
    expected.dicomNetworkConnection = [{ ...expected.dicomNetworkConnection![0], dcmNetworkConnection: { dcmTCPConnectTimeout: 5000 } }]
    expect(lastPut(archive, 'storescp')).toEqual(expected)
  })

  it('«Все параметры» архива не дублируют его настройки и список AE', async () => {
    configArchive().install()
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'dcm4chee-arc')
    await user.click(screen.getByRole('tab', { name: 'Все параметры' }))
    expect(screen.queryByRole('combobox', { name: 'Политика перезаписи' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^AE устройства:/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Веб-приложения: 1 запись' })).toBeInTheDocument()
  })

  it('кнопки AE ведут в редактор AE', async () => {
    configArchive().install()
    const { user, search } = renderApp('/settings?tab=devices')
    await openDevice(user, 'dcm4chee-arc')
    await user.click(screen.getByRole('button', { name: 'WORKLIST' }))
    await waitFor(() => expect(search()).toMatchObject({ tab: 'ae', device: 'dcm4chee-arc', ae: 'WORKLIST' }))
    expect(await screen.findByDisplayValue('Modality and Unified Worklist')).toBeInTheDocument()
  })

  it('удаление устройства — DELETE после подтверждения', async () => {
    const archive = configArchive().install()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp('/settings?tab=devices')
    await openDevice(user, 'storescp')
    await user.click(screen.getByRole('button', { name: 'Удалить устройство' }))
    await waitFor(() => expect(archive.calls('DELETE', '/devices/storescp')).toHaveLength(1))
    expect(archive.store.has('storescp')).toBe(false)
    expect(archive.store.get('dcm4chee-arc')).toEqual(clone(archiveDevice()))
  })
})
