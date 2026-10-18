import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { zipSync } from 'fflate'
import { FakeArchive, json } from '../../test/fakeArchive'
import type { RecordedRequest } from '../../test/fakeArchive'
import { AETS } from '../../test/fixtures'
import { dicomFile, studyFiles } from '../../test/dicomFiles'
import { renderApp } from '../../test/renderApp'
import { parseHeader } from './scan'

/** Части multipart/related из настоящего тела запроса — так, как их разберёт архив. */
async function multipartParts(request: RecordedRequest): Promise<Uint8Array[]> {
  const type = request.headers.get('Content-Type') ?? ''
  const boundary = /boundary=([^;]+)/.exec(type)?.[1]
  if (!boundary || !request.blob) return []
  const bytes = new Uint8Array(await request.blob.arrayBuffer())
  const marker = new TextEncoder().encode(`--${boundary}`)
  const starts: number[] = []
  outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer
    starts.push(i)
  }
  const parts: Uint8Array[] = []
  for (let k = 0; k < starts.length - 1; k++) {
    const chunk = bytes.subarray(starts[k] + marker.length, starts[k + 1] - 2) // без \r\n перед границей
    const headerEnd = chunk.findIndex((_, i) => chunk[i] === 13 && chunk[i + 1] === 10 && chunk[i + 2] === 13 && chunk[i + 3] === 10)
    parts.push(chunk.subarray(headerEnd + 4))
  }
  return parts
}

const sopUIDs = async (request: RecordedRequest) =>
  (await multipartParts(request)).map((part) => {
    const info = parseHeader(part)
    return typeof info === 'string' ? info : info.sopUID
  })

/** Фейковый STOW: принимает всё, кроме перечисленных SOP UID (их — с указанной причиной). */
function stowArchive({ reject = new Map<string, number>(), status }: { reject?: Map<string, number>; status?: number } = {}) {
  const archive = new FakeArchive()
  archive.on('GET', '/aets', AETS)
  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies(\/count|\/size)?$/, undefined)
  archive.on('POST', /^\/aets\/[^/]+\/rs\/studies$/, async (request) => {
    if (status) return new Response('сбой', { status })
    const uids = await sopUIDs(request)
    const stored = uids.filter((uid) => !reject.has(uid))
    const failed = uids.filter((uid) => reject.has(uid))
    return json({
      ...(stored.length && { '00081199': { vr: 'SQ', Value: stored.map((uid) => ({ '00081155': { vr: 'UI', Value: [uid] } })) } }),
      ...(failed.length && { '00081198': { vr: 'SQ', Value: failed.map((uid) => ({
        '00081155': { vr: 'UI', Value: [uid] }, '00081197': { vr: 'US', Value: [reject.get(uid)] },
      })) } }),
    }, { status: failed.length ? (stored.length ? 202 : 409) : 200 })
  })
  return archive.install()
}

async function pick(user: ReturnType<typeof renderApp>['user'], files: File[]) {
  await user.upload(await screen.findByLabelText('Выбрать файлы'), files)
}

describe('загрузка: выбор и проверка до отправки', () => {
  it('файлы разобраны по исследованиям, мусор и повторы показаны, ничего не отправлено', async () => {
    const archive = stowArchive()
    const { user } = renderApp('/upload')
    const ct = studyFiles('C', 3)
    const mr = studyFiles('M', 2, { patientName: 'Петров^Пётр', modality: 'MR', description: 'МРТ головы' })
    await pick(user, [...ct, ...mr, ct[0], new File(['jpeg'], 'фото.jpg'), new File(['?'], 'readme')])

    expect(await screen.findByText(/Найдено 5 снимков в 2 исследованиях/)).toBeInTheDocument()
    expect(screen.getByText(/пропущено 2 файла/)).toBeInTheDocument()
    expect(screen.getByText(/повторов 1/)).toBeInTheDocument()
    const ivanov = screen.getByText('Иванов Иван').closest('tr')!
    expect(within(ivanov).getByText('КТ грудной клетки')).toBeInTheDocument()
    expect(within(ivanov).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByText('Петров Пётр').closest('tr')!).getByText('МРТ головы')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Пропущенные файлы' })).getByText('фото.jpg')).toBeInTheDocument()
    expect(archive.calls('POST', /rs\/studies$/)).toHaveLength(0)
  })

  it('ZIP раскрывается прямо в браузере', async () => {
    stowArchive()
    const { user } = renderApp('/upload')
    const files = studyFiles('Z', 2)
    const zip = zipSync(Object.fromEntries(await Promise.all(
      files.map(async (file) => [`export/${file.name}`, new Uint8Array(await file.arrayBuffer())] as const),
    )))
    await pick(user, [new File([zip as Uint8Array<ArrayBuffer>], 'export.zip')])
    expect(await screen.findByText(/Найдено 2 снимка в 1 исследовании/)).toBeInTheDocument()
  })

  it('среди выбранного нет DICOM — загружать нечего', async () => {
    stowArchive()
    const { user } = renderApp('/upload')
    await pick(user, [new File(['x'], 'a.txt')])
    expect(await screen.findByText('DICOM-снимков среди выбранного нет')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Загрузить 0 снимков в DCM4CHEE' })).toBeDisabled()
  })
})

describe('загрузка: отправка', () => {
  it('STOW-RS: multipart/related с каждым файлом отдельной частью; итог и ссылка на исследование', async () => {
    const archive = stowArchive()
    const { user } = renderApp('/upload')
    const files = studyFiles('C', 3)
    await pick(user, files)
    await user.click(await screen.findByRole('button', { name: 'Загрузить 3 снимка в DCM4CHEE' }))

    expect(await screen.findByText('Загружено 3 из 3')).toBeInTheDocument()
    const [request] = archive.calls('POST', '/aets/DCM4CHEE/rs/studies')
    expect(request.headers.get('Content-Type')).toMatch(/^multipart\/related; type="application\/dicom"; boundary=/)
    expect(request.headers.get('Accept')).toBe('application/dicom+json')
    expect(await sopUIDs(request)).toEqual(['1.2.826.0.1.1.67.1.1', '1.2.826.0.1.1.67.1.2', '1.2.826.0.1.1.67.1.3'])
    // Файл уходит байт в байт.
    expect((await multipartParts(request))[0]).toEqual(new Uint8Array(await files[0].arrayBuffer()))

    const row = screen.getByText('Иванов Иван').closest('tr')!
    expect(within(row).getByText('загружено')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Открыть' }))
      .toHaveAttribute('href', '/studies?q=1.2.826.0.1.1.67&study=1.2.826.0.1.1.67')
  })

  it('отказы архива — по файлам, с причиной по-русски', async () => {
    const files = studyFiles('C', 3)
    stowArchive({ reject: new Map([['1.2.826.0.1.1.67.1.2', 0xa900]]) })
    const { user } = renderApp('/upload')
    await pick(user, files)
    await user.click(await screen.findByRole('button', { name: /^Загрузить 3 снимка/ }))

    expect(await screen.findByText('Загружено 2 из 3')).toBeInTheDocument()
    expect(screen.getByText('· не принято: 1')).toBeInTheDocument()
    expect(screen.getByText('принято 2 из 3')).toBeInTheDocument()
    const problems = screen.getByRole('list', { name: 'Проблемы: Иванов Иван' })
    expect(within(problems).getByText('C-2.dcm')).toBeInTheDocument()
    expect(within(problems).getByText('данные не соответствуют SOP-классу (A900H)')).toBeInTheDocument()
  })

  it('ничего не принято (409) — тоже отчёт, а не ошибка', async () => {
    const files = studyFiles('C', 1)
    stowArchive({ reject: new Map([['1.2.826.0.1.1.67.1.1', 0xc000]]) })
    const { user } = renderApp('/upload')
    await pick(user, files)
    await user.click(await screen.findByRole('button', { name: /^Загрузить 1 снимок/ }))
    expect(await screen.findByText('архив не смог разобрать файл (C000H)')).toBeInTheDocument()
    expect(screen.queryByText(/Загрузка прервана/)).toBeNull()
  })

  it('много файлов — несколько запросов по 50, прогресс по объёму', async () => {
    const archive = stowArchive()
    const { user } = renderApp('/upload')
    const files = Array.from({ length: 120 }, (_, index) => dicomFile(`f${index}.dcm`, {
      studyUID: '9.9', seriesUID: '9.9.1', sopUID: `9.9.1.${index}`, patientName: 'Много^Снимков',
    }))
    await pick(user, files)
    await user.click(await screen.findByRole('button', { name: 'Загрузить 120 снимков в DCM4CHEE' }))
    expect(await screen.findByText('Загружено 120 из 120')).toBeInTheDocument()
    const requests = archive.calls('POST', '/aets/DCM4CHEE/rs/studies')
    expect(await Promise.all(requests.map(async (request) => (await sopUIDs(request)).length))).toEqual([50, 50, 20])
    const bar = screen.getByRole('progressbar', { name: 'Загрузка' })
    expect(bar.getAttribute('aria-valuenow')).toBe(bar.getAttribute('aria-valuemax'))
  })

  it('загрузка в выбранный AE архива', async () => {
    const archive = stowArchive()
    const { user } = renderApp('/upload')
    const target = await screen.findByRole('combobox', { name: 'AE архива, куда загружать' })
    await within(target).findByRole('option', { name: 'AS_RECEIVED' })
    await user.selectOptions(target, 'AS_RECEIVED')
    await pick(user, studyFiles('C', 1))
    await user.click(await screen.findByRole('button', { name: 'Загрузить 1 снимок в AS_RECEIVED' }))
    await screen.findByText('Загружено 1 из 1')
    expect(archive.calls('POST', '/aets/AS_RECEIVED/rs/studies')).toHaveLength(1)
    expect(archive.calls('POST', '/aets/DCM4CHEE/rs/studies')).toHaveLength(0)
  })

  it('сбой архива — понятное сообщение, неотправленное видно', async () => {
    stowArchive({ status: 500 })
    const { user } = renderApp('/upload')
    await pick(user, studyFiles('C', 2))
    await user.click(await screen.findByRole('button', { name: /^Загрузить 2 снимка/ }))
    expect(await screen.findByText(/Загрузка прервана: HTTP 500/)).toBeInTheDocument()
    expect(screen.getByText('· не отправлено: 2')).toBeInTheDocument()
    expect(within(screen.getByText('Иванов Иван').closest('tr')!).getByText('не отправлено')).toBeInTheDocument()
  })

  it('«Остановить» прерывает текущую пачку и не начинает следующие', async () => {
    const archive = new FakeArchive()
    archive.on('GET', '/aets', AETS)
    let release: (() => void) | undefined
    archive.on('POST', '/aets/DCM4CHEE/rs/studies', () => new Promise<Response>((resolve) => {
      release = () => resolve(json({}))
    }))
    archive.install()
    const { user } = renderApp('/upload')
    await pick(user, Array.from({ length: 60 }, (_, index) => dicomFile(`f${index}.dcm`, {
      studyUID: '9.9', seriesUID: '9.9.1', sopUID: `9.9.1.${index}`,
    })))
    await user.click(await screen.findByRole('button', { name: /^Загрузить 60/ }))
    await waitFor(() => expect(release).toBeDefined())
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    release!()
    expect(await screen.findByRole('button', { name: 'Загрузить ещё' })).toBeInTheDocument()
    expect(archive.calls('POST', '/aets/DCM4CHEE/rs/studies')).toHaveLength(1)
  })
})
