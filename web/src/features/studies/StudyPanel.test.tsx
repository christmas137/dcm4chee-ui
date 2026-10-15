import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { IVANOV_CHEST, standardArchive, STUDIES } from '../../test/fixtures'
import type { StudyFixture } from '../../test/fixtures'
import { json } from '../../test/fakeArchive'
import { renderApp } from '../../test/renderApp'

const SERIES_PATH = `/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid}/series`
const studyUrl = (extra = '') => `/studies?study=${IVANOV_CHEST.uid}${extra}`

describe('панель исследования: открытие и закрытие', () => {
  it('один клик по строке открывает панель с данными исследования', async () => {
    const archive = standardArchive().install()
    const { user, search } = renderApp('/studies')

    await user.click(await screen.findByText('КТ органов грудной клетки'))

    expect(search().study).toBe(IVANOV_CHEST.uid)
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })
    expect(await within(aside).findByRole('heading', { name: 'Иванов Иван Иванович' })).toBeInTheDocument()
    expect(within(aside).getByText('P-1001')).toBeInTheDocument()
    expect(within(aside).getByText(/№ ACC20000 · 3 серии · 49 снимков · 1\.6 МБ/)).toBeInTheDocument()
    // Заголовок панели запрашивается отдельно — по UID, а не берётся из списка.
    const studyQuery = archive.calls('GET', '/aets/DCM4CHEE/rs/studies')
      .find((request) => request.params.get('StudyInstanceUID') === IVANOV_CHEST.uid)
    expect(studyQuery?.params.getAll('includefield')).toEqual(['StudyDescription', '77771029'])
    expect(archive.unmatched).toEqual([])
  })

  it('открывается по ссылке, даже если исследования нет в текущей выборке', async () => {
    standardArchive().install()
    renderApp(`/studies?q=Петрова&study=${IVANOV_CHEST.uid}`)
    expect(await within(await screen.findByRole('complementary', { name: 'Исследование' }))
      .findByRole('heading', { name: 'Иванов Иван Иванович' })).toBeInTheDocument()
  })

  it('крестик закрывает панель и убирает её параметры из адреса', async () => {
    standardArchive().install()
    const { user, search } = renderApp(studyUrl(`&series=${IVANOV_CHEST.series![1].uid}`))
    await user.click(await screen.findByRole('button', { name: 'Закрыть панель' }))
    expect(screen.queryByRole('complementary', { name: 'Исследование' })).not.toBeInTheDocument()
    expect(search()).not.toHaveProperty('study')
    expect(search()).not.toHaveProperty('series')
  })

  it('Esc закрывает панель', async () => {
    standardArchive().install()
    const { user, search } = renderApp(studyUrl())
    await screen.findByRole('complementary', { name: 'Исследование' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(search().study).toBeUndefined())
  })

  it('пока панель открыта, таблица прячет второстепенные колонки', async () => {
    standardArchive().install()
    renderApp(studyUrl())
    await screen.findByRole('complementary', { name: 'Исследование' })
    expect(screen.queryByRole('button', { name: '№ назначения' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Описание' })).toBeInTheDocument()
  })
})

describe('панель исследования: серии и снимки', () => {
  it('показывает серии по порядку номеров, с модальностью и числом снимков', async () => {
    // Архив отдаёт серии в порядке поступления — перемешаем, чтобы проверить сортировку.
    const shuffled: StudyFixture = { ...IVANOV_CHEST, series: [...IVANOV_CHEST.series!].reverse() }
    standardArchive([shuffled, ...STUDIES.slice(1)]).install()
    renderApp(studyUrl())

    const items = await within(await screen.findByRole('complementary', { name: 'Исследование' }))
      .findAllByRole('button', { expanded: false })
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/#1 Topogram.*CT · 1 снимок/),
      expect.stringMatching(/#2 Chest 1\.0mm.*CT · 24 снимка/),
      expect.stringMatching(/#3 Chest 5\.0mm.*CT · 24 снимка/),
    ])
  })

  it('снимки грузятся только при раскрытии серии, порцией по номеру снимка', async () => {
    const archive = standardArchive().install()
    const { user, search } = renderApp(studyUrl())
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })
    await within(aside).findByText('Chest 1.0mm')

    expect(archive.calls('GET', /\/instances$/)).toHaveLength(0)

    await user.click(within(aside).getByRole('button', { name: /Chest 1\.0mm/ }))
    expect(await within(aside).findAllByRole('button', { name: /^Снимок \d+$/ })).toHaveLength(24)

    const [request] = archive.calls('GET', /\/instances$/)
    expect(request.path).toBe(`${SERIES_PATH}/${IVANOV_CHEST.series![1].uid}/instances`)
    expect(request.params.get('orderby')).toBe('InstanceNumber')
    expect(request.params.get('limit')).toBe('100')
    expect(search().series).toBe(IVANOV_CHEST.series![1].uid)
  })

  it('повторный клик сворачивает серию', async () => {
    standardArchive().install()
    const { user, search } = renderApp(studyUrl(`&series=${IVANOV_CHEST.series![1].uid}`))
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })
    await user.click(await within(aside).findByRole('button', { name: /Chest 1\.0mm/, expanded: true }))
    expect(search().series).toBeUndefined()
    expect(within(aside).queryByRole('button', { name: /^Снимок/ })).not.toBeInTheDocument()
  })

  it('большая серия догружается по кнопке «Показать ещё»', async () => {
    const big: StudyFixture = {
      ...IVANOV_CHEST,
      series: [{
        uid: '1.2.3.100.9', number: 1, desc: 'Тонкие срезы', modality: 'CT',
        instances: Array.from({ length: 150 }, (_, i) => ({ sop: `1.2.3.100.9.${i + 1}`, number: i + 1 })),
      }],
    }
    const archive = standardArchive([big]).install()
    const { user } = renderApp(studyUrl(`&series=1.2.3.100.9`))
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })

    expect(await within(aside).findAllByRole('button', { name: /^Снимок \d+$/ })).toHaveLength(100)
    await user.click(within(aside).getByRole('button', { name: 'Показать ещё' }))
    await waitFor(() => expect(within(aside).getAllByRole('button', { name: /^Снимок \d+$/ })).toHaveLength(150))
    expect(archive.calls('GET', /\/instances$/).map((r) => r.params.get('offset'))).toEqual(['0', '100'])
    expect(within(aside).queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument()
  })

  it('ошибка архива при загрузке серий показывается, а не глотается', async () => {
    standardArchive().on('GET', SERIES_PATH, json('внутренняя ошибка', { status: 500 })).install()
    renderApp(studyUrl())
    expect(await screen.findByText('Запрос к архиву не прошёл')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })
})

describe('панель исследования: метаданные', () => {
  it('клик по снимку открывает метаданные именно этого снимка', async () => {
    const archive = standardArchive().install()
    const target = IVANOV_CHEST.series![1]
    const { user, search } = renderApp(studyUrl(`&series=${target.uid}`))
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })

    await user.click(await within(aside).findByRole('button', { name: 'Снимок 5' }))

    expect(search()).toMatchObject({ pane: 'meta', series: target.uid, sop: `${target.uid}.5` })
    expect(await within(aside).findByText('Серия #2 Chest 1.0mm · снимок #5')).toBeInTheDocument()
    expect(archive.calls('GET', /\/metadata$/).map((r) => r.path)).toEqual([
      `${SERIES_PATH}/${target.uid}/instances/${target.uid}.5/metadata`,
    ])
  })

  it('без выбранного снимка показывает первый снимок первой серии', async () => {
    const archive = standardArchive().install()
    const { user } = renderApp(studyUrl())
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })

    await user.click(within(aside).getByRole('tab', { name: 'Метаданные' }))

    expect(await within(aside).findByText('Серия #1 Topogram · снимок #1')).toBeInTheDocument()
    const firstInstance = archive.calls('GET', /\/instances$/)[0]
    expect(firstInstance.params.get('limit')).toBe('1')
    expect(firstInstance.params.get('orderby')).toBe('InstanceNumber')
  })

  it('показывает теги с именами из словаря, VR и значениями', async () => {
    standardArchive().install()
    renderApp(studyUrl(`&pane=meta&series=${IVANOV_CHEST.series![1].uid}&sop=${IVANOV_CHEST.series![1].uid}.1`))
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })

    const nameRow = (await within(aside).findByText('PatientName')).closest('tr')!
    expect(within(nameRow).getByText('(0010,0010)')).toBeInTheDocument()
    expect(within(nameRow).getByText('PN')).toBeInTheDocument()
    expect(within(nameRow).getByText('Иванов^Иван^Иванович')).toBeInTheDocument()
    // Пиксельные данные не выводятся.
    const pixelRow = within(aside).getByText('PixelData').closest('tr')!
    expect(within(pixelRow).getByText('бинарные данные')).toBeInTheDocument()
  })

  it('поиск по тегу оставляет только подходящие строки', async () => {
    standardArchive().install()
    const { user } = renderApp(studyUrl(`&pane=meta&series=${IVANOV_CHEST.series![1].uid}&sop=${IVANOV_CHEST.series![1].uid}.1`))
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })
    await within(aside).findByText('PatientName')

    await user.type(within(aside).getByLabelText('Поиск по метаданным'), '0010,0020')
    const rows = within(aside).getAllByRole('row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('P-1001')).toBeInTheDocument()
  })

  it('поиск находит значение внутри последовательности и показывает её контекст', async () => {
    standardArchive().install()
    const { user } = renderApp(studyUrl(`&pane=meta&series=${IVANOV_CHEST.series![1].uid}&sop=${IVANOV_CHEST.series![1].uid}.1`))
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })
    await within(aside).findByText('PatientName')

    await user.type(within(aside).getByLabelText('Поиск по метаданным'), 'CTCHEST')
    const kinds = within(aside).getAllByRole('row').map((row) => row.getAttribute('data-kind'))
    expect(kinds).toEqual(['sequence', 'item', 'element'])
    expect(within(aside).getByText('ProcedureCodeSequence')).toBeInTheDocument()
  })

  it('переключатель JSON показывает метаданные как есть', async () => {
    standardArchive().install()
    const { user } = renderApp(studyUrl(`&pane=meta&series=${IVANOV_CHEST.series![1].uid}&sop=${IVANOV_CHEST.series![1].uid}.1`))
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })
    await within(aside).findByText('PatientName')

    await user.click(within(aside).getByRole('button', { name: 'JSON' }))
    const raw = within(aside).getByLabelText('Сырой DICOM JSON')
    expect(JSON.parse(raw.textContent!)).toMatchObject({ '00100020': { vr: 'LO', Value: ['P-1001'] } })
    expect(within(aside).queryByLabelText('Поиск по метаданным')).not.toBeInTheDocument()
  })

  it('ссылка с выбранным снимком открывает его метаданные сразу', async () => {
    const archive = standardArchive().install()
    const target = IVANOV_CHEST.series![2]
    renderApp(studyUrl(`&pane=meta&series=${target.uid}&sop=${target.uid}.7`))
    expect(await screen.findByText('Серия #3 Chest 5.0mm · снимок #7')).toBeInTheDocument()
    // Снимок известен из ссылки — «первый снимок серии» не запрашивается.
    expect(archive.calls('GET', /\/instances$/)).toHaveLength(0)
  })

  it('ошибка загрузки метаданных показывается', async () => {
    standardArchive().install()
    const target = IVANOV_CHEST.series![1]
    renderApp(studyUrl(`&pane=meta&series=${target.uid}&sop=нет-такого`))
    expect(await within(await screen.findByRole('complementary', { name: 'Исследование' }))
      .findByText('Запрос к архиву не прошёл')).toBeInTheDocument()
  })
})
