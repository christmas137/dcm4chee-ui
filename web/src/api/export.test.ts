import { describe, expect, it } from 'vitest'
import { echo, exportTo, humanizeSendError, SendError } from './export'
import { FakeArchive, json } from '../test/fakeArchive'

const STUDY = '1.2.3'
const STUDY_EXPORT = /^\/aets\/DCM4CHEE\/rs\/studies\/1\.2\.3\/export\/.+$/

/** Ответы сняты со стенда 5.35.1. */
describe('отправка: разбор ответов архива', () => {
  it('dicom:AE — синхронно, счётчики; путь серии — через /series/{uid}', async () => {
    const archive = new FakeArchive().install()
    archive.on('POST', /\/export\//, () => json({ completed: 3 }))
    expect(await exportTo('DCM4CHEE', { study: STUDY }, 'dicom:STORESCP')).toEqual({ kind: 'sent', completed: 3, failed: 0 })
    await exportTo('DCM4CHEE', { study: STUDY, series: '1.2.3.4' }, 'dicom:STORESCP')
    expect(archive.requests.map((request) => request.path)).toEqual([
      '/aets/DCM4CHEE/rs/studies/1.2.3/export/dicom:STORESCP',
      '/aets/DCM4CHEE/rs/studies/1.2.3/series/1.2.3.4/export/dicom:STORESCP',
    ])
  })

  it('502 со счётчиками — частичный результат, а не сбой', async () => {
    new FakeArchive().install().on('POST', STUDY_EXPORT, json({ completed: 0, failed: 3 }, { status: 502 }))
    expect(await exportTo('DCM4CHEE', { study: STUDY }, 'dicom:VERIFONLY')).toEqual({ kind: 'sent', completed: 0, failed: 3 })
  })

  it('недоступный и неизвестный узел — понятные сообщения', async () => {
    const archive = new FakeArchive().install()
    archive.on('POST', STUDY_EXPORT, json({ errorMessage: 'java.net.UnknownHostException: storescp: System error' }, { status: 502 }))
    await expect(exportTo('DCM4CHEE', { study: STUDY }, 'dicom:STORESCP'))
      .rejects.toEqual(new SendError('Архив не нашёл адрес узла: storescp'))
    archive.on('POST', STUDY_EXPORT, json({ errorMessage: 'Unknown AE: NOSUCH' }, { status: 404 }))
    await expect(exportTo('DCM4CHEE', { study: STUDY }, 'dicom:NOSUCH'))
      .rejects.toEqual(new SendError('Архив не знает такого AE: NOSUCH'))
  })

  it('экспортёр — 202 и задача в очереди', async () => {
    new FakeArchive().install().on('POST', STUDY_EXPORT, json(
      { taskID: '17', queue: 'Export', type: 'EXPORT', status: 'SCHEDULED' }, { status: 202 },
    ))
    expect(await exportTo('DCM4CHEE', { study: STUDY }, 'TEST_EXP')).toEqual({ kind: 'queued', taskID: '17', queue: 'Export' })
  })
})

describe('проверка связи (C-ECHO)', () => {
  it('успех — время ответа; отказ — 200 с result≠0; неизвестный AE — 404 с одним именем', async () => {
    const archive = new FakeArchive().install()
    archive.on('POST', '/aets/DCM4CHEE/dimse/STORESCP', { result: '0', connectionTime: '28', echoTime: '5', releaseTime: '0' })
    expect(await echo('DCM4CHEE', 'STORESCP')).toEqual({ ok: true, ms: 33 })

    archive.on('POST', '/aets/DCM4CHEE/dimse/STORESCP', {
      result: '2', errorMessage: 'Failed to connect: java.net.ConnectException: Connection refused',
    })
    expect(await echo('DCM4CHEE', 'STORESCP'))
      .toEqual({ ok: false, message: 'Узел не принимает подключение: порт закрыт или служба не запущена' })

    archive.on('POST', '/aets/DCM4CHEE/dimse/NOSUCH', json({ errorMessage: 'NOSUCH' }, { status: 404 }))
    expect(await echo('DCM4CHEE', 'NOSUCH')).toEqual({ ok: false, message: 'Архив не знает такого AE: NOSUCH' })
  })

  it('прочие сообщения архива остаются как есть', () => {
    expect(humanizeSendError('что-то своё')).toBe('что-то своё')
    expect(humanizeSendError('Read timed out')).toBe('Узел не ответил вовремя')
  })
})
