import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { formatDA } from '../../api/dicom'
import { json } from '../../test/fakeArchive'
import { IVANOV_CHEST, standardArchive, studyJson } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'

const STUDIES = '/aets/DCM4CHEE/rs/studies'

/** Параметры последнего QIDO-поиска исследований (не считая запроса заголовка панели). */
function lastSearch(archive: ReturnType<typeof standardArchive>): URLSearchParams {
  const calls = archive.calls('GET', STUDIES).filter((r) => !r.params.has('StudyInstanceUID'))
  return calls[calls.length - 1].params
}

const rowNames = () => screen.getAllByRole('row').map((row) => row.querySelector('span')?.textContent)

async function searchFor(user: ReturnType<typeof renderApp>['user'], text: string) {
  const box = screen.getByPlaceholderText(/^Поиск:/)
  await user.clear(box)
  if (text) await user.type(box, text)
  await user.keyboard('{Enter}')
}

describe('список исследований', () => {
  it('стартовый запрос: страница 100, описание и размер, свежие сверху', async () => {
    const archive = standardArchive().install()
    renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')

    const params = lastSearch(archive)
    expect(params.get('limit')).toBe('100')
    expect(params.get('offset')).toBe('0')
    expect(params.get('orderby')).toBe('-StudyDate,-StudyTime')
    expect(params.getAll('includefield')).toEqual(['StudyDescription', '77771029'])
  })

  it('показывает строки и итог по количеству и объёму', async () => {
    standardArchive().install()
    renderApp('/studies')
    expect(await screen.findByText('3 исследования')).toBeInTheDocument()
    // 1669 + 2448 + 83 КБ
    expect(await screen.findByText('4,1 МБ')).toBeInTheDocument()
    const ivanov = screen.getByText('Иванов Иван Иванович').closest('[role="row"]') as HTMLElement
    expect(within(ivanov).getByText('P-1001')).toBeInTheDocument()
    expect(within(ivanov).getByText('12.09.2026 08:47')).toBeInTheDocument()
    expect(within(ivanov).getByTitle('12.03.1964, М')).toBeInTheDocument()
    expect(within(ivanov).getByText('ACC20000')).toBeInTheDocument()
    expect(within(ivanov).getByText('1,6 МБ')).toBeInTheDocument()
  })

  it('пустой результат (204) — подсказка, а не пустой экран', async () => {
    standardArchive().install()
    const { user } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    await searchFor(user, 'Нетакойфамилии')
    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
  })

  it('ошибка архива показывается с кнопкой повтора', async () => {
    standardArchive().on('GET', STUDIES, json('boom', { status: 500 })).install()
    renderApp('/studies')
    expect(await screen.findByText('Запрос к архиву не прошёл')).toBeInTheDocument()
  })

  it('заголовок Warning от архива виден пользователю', async () => {
    standardArchive()
      .on('GET', STUDIES, () => json([studyJson(IVANOV_CHEST)], { headers: { Warning: '299 Remote AE unreachable' } }))
      .install()
    renderApp('/studies')
    expect(await screen.findByText(/Архив вернул неполный ответ: 299 Remote AE unreachable/)).toBeInTheDocument()
  })
})

describe('омнибокс', () => {
  it('фамилия → маска по PatientName, запрос попадает в адрес', async () => {
    const archive = standardArchive().install()
    const { user, search } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')

    await searchFor(user, 'Петрова')

    await waitFor(() => expect(rowNames()).toEqual(['Петрова Мария Сергеевна']))
    expect(lastSearch(archive).get('PatientName')).toBe('*Петрова*')
    expect(search().q).toBe('Петрова')
    const understood = screen.getByRole('list', { name: 'Как понят запрос' })
    expect(within(understood).getByText('пациент')).toBeInTheDocument()
    expect(within(understood).getByText('*Петрова*')).toBeInTheDocument()
  })

  it('номер, не найденный как назначение, ищется как ID пациента — с пояснением', async () => {
    standardArchive().install()
    const { user } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')

    await searchFor(user, 'P-1001')

    expect(await screen.findByText('найдено по ID пациента')).toBeInTheDocument()
    expect(rowNames()).toEqual(['Иванов Иван Иванович'])
  })

  it('номер назначения находится сразу, без подсказки', async () => {
    const archive = standardArchive().install()
    const { user } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    await searchFor(user, 'ACC20001')

    await waitFor(() => expect(rowNames()).toEqual(['Петрова Мария Сергеевна']))
    expect(screen.queryByText(/найдено по/)).not.toBeInTheDocument()
    expect(lastSearch(archive).get('AccessionNumber')).toBe('ACC20001')
  })

  it('составной запрос: фамилия + модальность + дата одной строкой', async () => {
    const archive = standardArchive().install()
    const { user } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    await searchFor(user, 'Иванов CT 12.09.2026')

    await waitFor(() => expect(lastSearch(archive).get('StudyDate')).toBe('20260912'))
    const params = lastSearch(archive)
    expect(params.get('PatientName')).toBe('*Иванов*')
    expect(params.get('ModalitiesInStudy')).toBe('CT')
  })

  it('открывается по ссылке с заполненной строкой', async () => {
    standardArchive().install()
    renderApp('/studies?q=Smith')
    await waitFor(() => expect(rowNames()).toEqual(['Smith John A']))
    expect(screen.getByPlaceholderText(/^Поиск:/)).toHaveValue('Smith')
  })

  it('«/» ставит фокус в поиск', async () => {
    standardArchive().install()
    const { user } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    await user.keyboard('/')
    expect(screen.getByPlaceholderText(/^Поиск:/)).toHaveFocus()
  })
})

describe('строка интерпретации запроса', () => {
  it('без запроса — подсказка, как искать', async () => {
    standardArchive().install()
    renderApp('/studies')
    expect(await screen.findByText(/Все исследования\. Пишите, что помните/)).toBeInTheDocument()
  })

  it('показывает то, что реально ушло в архив, включая переключатели', async () => {
    standardArchive().install()
    const { user } = renderApp('/studies?q=Иванов')
    const understood = await screen.findByRole('list', { name: 'Как понят запрос' })
    expect(within(understood).getByText('*Иванов*')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'CT' }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Как понят запрос' })).getByText('модальность')).toBeInTheDocument())
  })

  it('диапазон дат — по-человечески', async () => {
    standardArchive().install()
    renderApp('/studies?q=2026-03')
    const understood = await screen.findByRole('list', { name: 'Как понят запрос' })
    expect(within(understood).getByText('01.03.2026 – 31.03.2026')).toBeInTheDocument()
  })

  it('сработавший запасной вариант виден в строке', async () => {
    standardArchive().install()
    renderApp('/studies?q=P-1002')
    const understood = await screen.findByRole('list', { name: 'Как понят запрос' })
    expect(within(understood).getByText('ID пациента')).toBeInTheDocument()
    expect(within(understood).getByText('найдено по ID пациента')).toBeInTheDocument()
  })
})

describe('чипы фильтров', () => {
  it('модальность уходит в ModalitiesInStudy и в адрес', async () => {
    const archive = standardArchive().install()
    const { user, href } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')

    await user.click(screen.getByRole('button', { name: 'MR' }))
    await user.click(screen.getByRole('button', { name: 'US' }))

    await waitFor(() => expect(lastSearch(archive).get('ModalitiesInStudy')).toBe('MR\\US'))
    expect(href()).toContain('mod=MR,US')
    expect(rowNames()).toEqual(['Петрова Мария Сергеевна', 'Smith John A'])
  })

  it('«Сегодня» ставит период, «Все даты» его снимает (регрессия: период залипал)', async () => {
    const archive = standardArchive().install()
    const { user, search } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    const today = formatDA(new Date())

    await user.click(screen.getByRole('button', { name: 'Сегодня' }))
    await waitFor(() => expect(lastSearch(archive).get('StudyDate')).toBe(today))

    await user.click(screen.getByRole('button', { name: 'Все даты' }))
    await waitFor(() => expect(lastSearch(archive).has('StudyDate')).toBe(false))
    expect(search()).not.toHaveProperty('from')
    expect(search()).not.toHaveProperty('to')
  })

  it('чип даты перекрывает дату из текста запроса', async () => {
    const archive = standardArchive().install()
    const { user } = renderApp('/studies?q=2020')
    await waitFor(() => expect(lastSearch(archive).get('StudyDate')).toBe('20200101-20201231'))
    await user.click(screen.getByRole('button', { name: '7 дней' }))
    await waitFor(() => expect(lastSearch(archive).get('StudyDate')).toMatch(/^\d{8}-\d{8}$/))
    expect(lastSearch(archive).get('StudyDate')).not.toBe('20200101-20201231')
  })
})

describe('сортировка и клавиатура', () => {
  it('клик по заголовку: по убыванию → по возрастанию → по умолчанию', async () => {
    const archive = standardArchive().install()
    const { user, search } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    const header = () => screen.getByRole('button', { name: /^Пациент/ })

    await user.click(header())
    await waitFor(() => expect(lastSearch(archive).get('orderby')).toBe('-PatientName'))
    await user.click(header())
    await waitFor(() => expect(lastSearch(archive).get('orderby')).toBe('PatientName'))
    await user.click(header())
    await waitFor(() => expect(lastSearch(archive).get('orderby')).toBe('-StudyDate,-StudyTime'))
    expect(search()).not.toHaveProperty('sort')
  })

  it('j/k двигают выделение, Enter открывает выбранное', async () => {
    standardArchive().install()
    const { user, search } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')

    await user.keyboard('jjk')
    const selected = screen.getAllByRole('row').find((row) => row.getAttribute('aria-selected') === 'true')!
    expect(within(selected).getByText('Петрова Мария Сергеевна')).toBeInTheDocument()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(search().study).toBe('1.2.3.200'))
  })

  it('клавиши не перехватываются, пока печатаешь в поиске', async () => {
    standardArchive().install()
    const { user, search } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    await user.click(screen.getByPlaceholderText(/^Поиск:/))
    await user.keyboard('jk')
    expect(screen.getByPlaceholderText(/^Поиск:/)).toHaveValue('jk')
    expect(search().study).toBeUndefined()
  })
})
