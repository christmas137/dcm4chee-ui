import { describe, expect, it } from 'vitest'
import { allowedActions, bulkAction, describeOutcome, describeTarget, fetchTasks, queueLabel } from './tasks'
import type { Task } from './tasks'
import { sampleTasks, taskArchive } from '../test/taskArchive'
import { daysAgoDA, formatMoment } from '../lib/time'

const task = (id: string) => sampleTasks().find((item) => item.taskID === id)!

describe('задачи: описание для людей', () => {
  it('итог: отправлено/не удалось, для проверки — проверено/не прошло; ошибка — пересказом с числом попыток', () => {
    expect(describeOutcome(task('5'))).toBe('отправлено 72')
    expect(describeOutcome(task('6'))).toBe('отправлено 0, не удалось 49')
    expect(describeOutcome(task('151'))).toBe('проверено 2, не прошло проверку 1')
    expect(describeOutcome(task('7'))).toBe('Узел не принимает подключение: порт закрыт или служба не запущена (попыток: 3)')
    expect(describeOutcome({ ...task('7'), errorMessage: 'No Exporter configured with ID:TEST_EXP', failures: '1' }))
      .toBe('Экспортёра TEST_EXP нет в конфигурации — удалён или переименован')
    expect(describeOutcome(task('152'))).toBe('')
  })

  it('куда: экспортёр, пара AE для выдачи, AE архива для прочего', () => {
    expect(describeTarget(task('5'))).toBe('TO_STORESCP')
    expect(describeTarget(task('8'))).toBe('DCM4CHEE → STORESCP')
    expect(describeTarget(task('152'))).toBe('DCM4CHEE')
  })

  it('действия по статусу: активные — отменить; ждущие повтора — всё; завершённые — повторить и удалить', () => {
    expect(allowedActions('SCHEDULED')).toEqual(['cancel'])
    expect(allowedActions('IN PROCESS')).toEqual(['cancel'])
    expect(allowedActions('SCHEDULED FOR RETRY')).toEqual(['reschedule', 'cancel', 'delete'])
    expect(allowedActions('FAILED')).toEqual(['reschedule', 'delete'])
    expect(allowedActions('COMPLETED')).toEqual(['reschedule', 'delete'])
  })

  it('названия очередей по-русски; незнакомая — из описания архива', () => {
    expect(queueLabel('StgVerTasks')).toBe('Проверка хранения')
    expect(queueLabel({ name: 'Custom', description: 'Своя очередь' })).toBe('Своя очередь')
  })
})

describe('задачи: запросы', () => {
  it('из нескольких очередей — одним списком, свежие сверху, с общим лимитом; фильтр уходит в каждую', async () => {
    const archive = taskArchive()
    const list = await fetchTasks(['Export', 'Retrieve', 'StgVerTasks'], { status: 'COMPLETED' }, 2)
    expect(list.map((item: Task) => item.taskID)).toEqual(['8', '5'])
    const queries = archive.calls('GET', /^\/queue\/[^/]+$/)
    expect(queries.map((request) => request.path)).toEqual(['/queue/Export', '/queue/Retrieve', '/queue/StgVerTasks'])
    for (const request of queries) {
      expect(Object.fromEntries(request.params)).toEqual({ status: 'COMPLETED', orderby: '-updatedTime', limit: '2' })
    }
  })

  it('массовое действие — в каждой очереди по фильтру; итог — сумма', async () => {
    const archive = taskArchive()
    expect(await bulkAction(['Export', 'StgVerTasks'], { status: 'FAILED', since: '20200101' }, 'reschedule')).toBe(2)
    expect(archive.calls('POST', /\/reschedule$/).map((request) => `${request.path}?${request.params}`)).toEqual([
      '/queue/Export/reschedule?status=FAILED&createdTime=20200101-',
      '/queue/StgVerTasks/reschedule?status=FAILED&createdTime=20200101-',
    ])
    expect(await bulkAction(['Export'], { status: 'WARNING' }, 'delete')).toBe(1)
    expect(archive.calls('DELETE', '/queue/Export')).toHaveLength(1)
  })
})

describe('время для людей', () => {
  const now = new Date(2026, 9, 18, 15, 0, 0)
  it.each([
    [new Date(2026, 9, 18, 14, 59, 40), 'только что'],
    [new Date(2026, 9, 18, 14, 55, 0), '5 мин назад'],
    [new Date(2026, 9, 18, 9, 7, 0), 'сегодня 09:07'],
    [new Date(2026, 9, 1, 9, 7, 0), '01.10 09:07'],
    [new Date(2025, 0, 2, 9, 7, 0), '02.01.2025 09:07'],
  ])('%s → %s', (date, text) => {
    expect(formatMoment(date.toISOString(), now)).toBe(text)
  })

  it('начало периода в формате DA', () => {
    expect(daysAgoDA(0, now)).toBe('20261018')
    expect(daysAgoDA(29, now)).toBe('20260919')
  })
})
