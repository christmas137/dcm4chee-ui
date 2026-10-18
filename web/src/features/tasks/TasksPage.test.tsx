import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderApp } from '../../test/renderApp'
import { taskArchive } from '../../test/taskArchive'
import { daysAgoDA } from '../../lib/time'

const rows = () => [...document.querySelectorAll('[data-task]')].map((row) => row.getAttribute('data-task'))
const nav = () => within(screen.getByRole('navigation', { name: 'Очереди' }))
const statusGroup = () => within(screen.getByRole('group', { name: 'Статус' }))

async function loaded() {
  await waitFor(() => expect(rows().length).toBeGreaterThan(0))
}

describe('экран задач', () => {
  it('все задачи одним списком, свежие сверху; пустые очереди не опрашиваются', async () => {
    const archive = taskArchive()
    renderApp('/tasks')
    await loaded()
    expect(rows()).toEqual(['StgVerTasks/152', 'Export/7', 'Retrieve/8', 'Export/6', 'Export/5', 'StgVerTasks/151'])
    expect(nav().getByRole('button', { name: 'Все задачи 6' })).toBeInTheDocument()
    expect(nav().getByRole('button', { name: 'Экспорт 3' })).toBeInTheDocument()
    expect(nav().getByRole('button', { name: 'Отправка HL7 0' })).toBeInTheDocument()
    // Список запрашивается только у непустых очередей.
    expect(archive.calls('GET', '/queue/HL7Send')).toHaveLength(0)

    const failed = screen.getByText('Узел не принимает подключение: порт закрыт или служба не запущена (попыток: 3)').closest('tr')!
    expect(within(failed).getByText('ошибка')).toBeInTheDocument()
    expect(within(failed).getByText('TO_DOWN')).toBeInTheDocument()
    expect(within(failed).getByText('CT · 48 снимков')).toBeInTheDocument()
    expect(within(failed).getByRole('link', { name: '1.2.3.7' })).toHaveAttribute('href', '/studies?q=1.2.3.7&study=1.2.3.7')
  })

  it('счётчики по статусам; очередь и статус — в адресе и в запросах', async () => {
    const archive = taskArchive()
    const { user, search } = renderApp('/tasks')
    await loaded()
    expect(statusGroup().getByRole('button', { name: 'ошибка 2' })).toBeInTheDocument()
    expect(statusGroup().getByRole('button', { name: 'готово 2' })).toBeInTheDocument()

    await user.click(nav().getByRole('button', { name: 'Экспорт 3' }))
    await user.click(statusGroup().getByRole('button', { name: /^ошибка/ }))
    await waitFor(() => expect(rows()).toEqual(['Export/7']))
    expect(search()).toMatchObject({ queue: 'Export', status: 'FAILED' })
    const last = archive.calls('GET', '/queue/Export').at(-1)!
    expect(last.params.get('status')).toBe('FAILED')
  })

  it('период — createdTime с начала периода', async () => {
    const archive = taskArchive()
    const { user } = renderApp('/tasks')
    await loaded()
    await user.click(screen.getByRole('button', { name: '7 дней' }))
    await waitFor(() => expect(rows()).not.toContain('StgVerTasks/151'))
    expect(archive.calls('GET', '/queue/Export').at(-1)!.params.get('createdTime')).toBe(`${daysAgoDA(6)}-`)
  })

  it('фильтр по исследованию и по пакету — плашками, которые снимаются', async () => {
    const archive = taskArchive()
    const { user, search } = renderApp('/tasks?study=1.2.3.8')
    await waitFor(() => expect(rows()).toEqual(['Retrieve/8']))
    await user.click(screen.getByRole('button', { name: 'Убрать фильтр: исследование 1.2.3.8' }))
    await waitFor(() => expect(rows()).toHaveLength(6))
    expect(search().study).toBeUndefined()

    await user.type(screen.getByRole('textbox', { name: 'Пакет' }), 'stgver-1{Enter}')
    await waitFor(() => expect(rows()).toEqual(['StgVerTasks/152', 'StgVerTasks/151']))
    expect(archive.calls('GET', '/queue/StgVerTasks').at(-1)!.params.get('batchID')).toBe('stgver-1')
    expect(screen.getByRole('button', { name: 'Убрать фильтр: пакет stgver-1' })).toBeInTheDocument()
  })

  it('клик по задаче раскрывает подробности, ссылка на них — в адресе', async () => {
    taskArchive()
    const { user, search } = renderApp('/tasks')
    await loaded()
    await user.click(screen.getByText('TO_DOWN'))
    expect(search().open).toBe('Export/7')
    const details = screen.getByLabelText('Подробности задачи 7')
    expect(within(details).getByText('java.net.ConnectException: Connection refused')).toBeInTheDocument()
    expect(within(details).getByText('3')).toBeInTheDocument()
  })

  it('повтор и удаление одной задачи — запрос к её очереди; список обновляется', async () => {
    const archive = taskArchive()
    const { user } = renderApp('/tasks')
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Повторить задачу 7' }))
    await waitFor(() => expect(within(screen.getByText('TO_DOWN').closest('tr')!).getByText('в очереди')).toBeInTheDocument())
    expect(archive.calls('POST', '/queue/Export/7/reschedule')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Отменить задачу 152' }))
    expect(archive.calls('POST', '/queue/StgVerTasks/152/cancel')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Удалить задачу 5' }))
    await waitFor(() => expect(rows()).not.toContain('Export/5'))
    expect(archive.calls('DELETE', '/queue/Export/5')).toHaveLength(1)
  })

  it('«Повторить все» с ошибкой — подтверждение, запрос по фильтру в каждую непустую очередь', async () => {
    const archive = taskArchive()
    const { user } = renderApp('/tasks?status=FAILED')
    await waitFor(() => expect(rows()).toEqual(['Export/7', 'StgVerTasks/151']))
    expect(screen.getByText('2 задачи со статусом «ошибка»')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить все' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Повторить 2 задачи' }))
    expect(archive.calls('POST', /\/reschedule$/)).toHaveLength(0)
    await user.click(dialog.getByRole('button', { name: 'Повторить' }))
    expect(await dialog.findByText('Готово: 2 задачи.')).toBeInTheDocument()
    expect(archive.calls('POST', /\/reschedule$/).map((request) => `${request.path}?${request.params}`).sort()).toEqual([
      '/queue/Export/reschedule?status=FAILED',
      '/queue/Retrieve/reschedule?status=FAILED',
      '/queue/StgVerTasks/reschedule?status=FAILED',
    ])
  })

  it('для активных — «Отменить все», без повтора и удаления', async () => {
    taskArchive()
    renderApp('/tasks?status=SCHEDULED')
    await waitFor(() => expect(rows()).toEqual(['StgVerTasks/152']))
    expect(screen.getByRole('button', { name: 'Отменить все' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить все' })).toBeNull()
  })

  it('задач нет — так и написано', async () => {
    taskArchive([])
    renderApp('/tasks')
    expect(await screen.findByText('Задач нет')).toBeInTheDocument()
  })
})
