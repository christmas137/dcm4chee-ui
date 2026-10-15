import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, buildQuery, getJson, getJsonFull, setAuthToken, apiFetch } from './client'

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => setAuthToken(null))

describe('строка запроса', () => {
  it('повторяет параметр для каждого значения массива — так QIDO ждёт includefield', () => {
    expect(buildQuery({ includefield: ['StudyDescription', '77771029'], limit: 100 }))
      .toBe('?includefield=StudyDescription&includefield=77771029&limit=100')
  })

  it('пропускает пустые значения', () => {
    expect(buildQuery({ a: undefined, b: null, c: '', d: 0, e: false })).toBe('?d=0&e=false')
    expect(buildQuery({})).toBe('')
  })

  it('кодирует кириллицу, маски и обратный слэш', () => {
    expect(buildQuery({ PatientName: '*Иванов*', ModalitiesInStudy: 'CT\\MR' }))
      .toBe('?PatientName=*%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2*&ModalitiesInStudy=CT%5CMR')
  })
})

describe('чтение JSON', () => {
  it('ходит в архив по префиксу /dcm4chee-arc', async () => {
    const fetchMock = stubFetch(new Response('[]', { status: 200 }))
    await getJson('/aets', { x: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/dcm4chee-arc/aets?x=1', expect.anything())
  })

  it('204 от QIDO — пустой список, а не ошибка', async () => {
    stubFetch(new Response(null, { status: 204 }))
    expect(await getJson('/aets/DCM4CHEE/rs/studies')).toEqual([])
  })

  it('отдаёт заголовок Warning — архив так сообщает о неполном ответе', async () => {
    stubFetch(new Response('[]', { status: 200, headers: { Warning: '299 arc: Remote AE unavailable' } }))
    expect(await getJsonFull('/x')).toEqual({ data: [], warning: '299 arc: Remote AE unavailable' })
  })

  it('ошибка HTTP превращается в ApiError с кодом и телом', async () => {
    stubFetch(new Response('Device not found', { status: 404 }))
    const error = await getJson('/devices/nope').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, body: 'Device not found', url: '/dcm4chee-arc/devices/nope' })
  })
})

describe('авторизация', () => {
  it('без токена заголовка Authorization нет', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))
    await apiFetch('/aets')
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('с токеном каждый запрос идёт с Bearer', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))
    setAuthToken('abc')
    await apiFetch('/aets')
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer abc')
  })
})
